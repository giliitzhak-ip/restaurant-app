import "server-only";
import { checksPassed, IG_HASHTAG_MAX, runChecks } from "../content/checks";
import { normalizeText } from "../content/similarity";
import { db } from "../db";
import { getMedia } from "../images/media";
import { errMsg, log } from "../logger";
import { getConnection, getSettings, publishMode } from "../settings";
import type { Post, Settings } from "../types";
import { clientFor, reverifyConnection } from "./connection";
import { GraphError } from "./graph";

export const MAX_ATTEMPTS = 4;
const BACKOFF_MIN = [5, 30, 120, 360];

export type PublishOutcome = "published" | "simulated" | "retry" | "failed" | "blocked";

export function finalCaption(post: Pick<Post, "caption" | "hashtags">, settings: Pick<Settings, "brand_hashtags">): string {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...post.hashtags, ...settings.brand_hashtags]) {
    const t = raw.trim().replace(/^#?/, "#").replace(/\s+/g, "");
    if (t.length < 2 || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    tags.push(t);
  }
  return `${post.caption.trim()}\n.\n${tags.slice(0, IG_HASHTAG_MAX).join(" ")}`;
}

async function update(id: string, patch: Partial<Post>) {
  const { error } = await db()
    .from("posts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`update post: ${error.message}`);
}

/** Re-run every content check right before publishing — edits after approval must not slip through. */
export async function recheck(post: Post): Promise<{ ok: boolean; post: Post }> {
  const { data: recent } = await db()
    .from("posts")
    .select("caption")
    .neq("id", post.id)
    .in("status", ["published", "simulated", "scheduled", "pending_approval", "publishing"])
    .order("created_at", { ascending: false })
    .limit(60);
  const checks = runChecks({
    caption: post.caption,
    hashtags: post.hashtags,
    cta: post.cta,
    createdBy: post.created_by,
    hasMedia: post.media_type === "REELS" ? Boolean(post.video_url) : Boolean(post.media_id),
    mediaType: post.media_type,
    recentCaptions: (recent ?? []).map((r) => r.caption as string),
  });
  const ok = checksPassed(checks);
  await update(post.id, { checks, checks_passed: ok });
  return { ok, post: { ...post, checks, checks_passed: ok } };
}

/** Handles a post that was atomically claimed (status = 'publishing'). */
export async function processClaimedPost(post: Post): Promise<PublishOutcome> {
  const settings = await getSettings();
  let conn = await getConnection();

  const { ok } = await recheck(post);
  if (!ok) {
    await update(post.id, { status: "pending_approval", last_error: "הפוסט לא עבר בדיקות תוכן לפני פרסום", locked_at: null });
    await log("warn", "publish.blocked", "פוסט נחסם – בדיקות תוכן נכשלו", { postId: post.id });
    return "blocked";
  }

  const media = post.media_id ? await getMedia(post.media_id) : null;
  if (post.media_type === "IMAGE" && !media) {
    await update(post.id, { status: "failed", last_error: "התמונה לא נמצאה", locked_at: null });
    return "failed";
  }
  const caption = finalCaption(post, settings);
  const mode = publishMode(settings, conn);

  // ───────── TEST MODE: validate everything, publish nothing ─────────
  if (!mode.live) {
    try {
      if (media) await assertImageFetchable(media.public_url, media.width, media.height);
      await update(post.id, {
        status: "simulated",
        published_at: new Date().toISOString(),
        last_error: null,
        locked_at: null,
      });
      await log("info", "publish.simulated", `סימולציה הצליחה (${caption.length} תווים). לא פורסם באינסטגרם.`, {
        postId: post.id,
        meta: { reasons: mode.reasons },
      });
      return "simulated";
    } catch (e) {
      return handleError(post, e, "simulate");
    }
  }

  // ───────── LIVE MODE ─────────
  if (post.media_type === "REELS") {
    await update(post.id, { status: "failed", last_error: "פרסום Reels עדיין לא נבדק – זמין רק בסימולציה", locked_at: null });
    return "failed";
  }

  try {
    // Permissions must have been verified within the last 24h.
    if (!conn.last_verified_at || Date.now() - new Date(conn.last_verified_at).getTime() > 864e5) {
      const v = await reverifyConnection();
      conn = await getConnection();
      if (!v?.ok) throw new GraphError(`אימות הרשאות Meta נכשל: ${v?.error ?? v?.missing.join(", ")}`, 403, 190);
    }
    const g = clientFor(conn);
    const igId = conn.ig_user_id!;

    if (post.ig_media_id) {
      await update(post.id, { status: "published", locked_at: null });
      return "published";
    }

    let containerId = post.ig_container_id;
    if (containerId) {
      const st = await g.containerStatus(containerId);
      if (st.status_code === "PUBLISHED") {
        // A previous run published it but crashed before saving. Find it — never publish twice.
        const recent = await g.recentMedia(igId, 10);
        const want = normalizeText(post.caption).slice(0, 80);
        const hit = recent.data.find((m) => normalizeText(m.caption ?? "").startsWith(want));
        if (!hit) {
          await update(post.id, {
            status: "failed",
            last_error: "הקונטיינר פורסם אך הפוסט לא אותר – יש לבדוק ידנית באינסטגרם",
            locked_at: null,
          });
          return "failed";
        }
        await update(post.id, {
          status: "published",
          ig_media_id: hit.id,
          ig_permalink: hit.permalink ?? null,
          published_at: hit.timestamp ?? new Date().toISOString(),
          locked_at: null,
        });
        return "published";
      }
      if (st.status_code === "ERROR" || st.status_code === "EXPIRED") containerId = null;
    }

    const quota = await g.publishingLimit(igId);
    if (quota.quota_total !== null && quota.quota_usage >= quota.quota_total) {
      throw new GraphError("הגעתם למגבלת הפרסומים היומית של Meta", 429, 4);
    }

    if (!containerId) {
      const c = await g.createImageContainer(igId, media!.public_url, caption, post.alt_text);
      containerId = c.id;
      await update(post.id, { ig_container_id: containerId });
    }

    let status = "IN_PROGRESS";
    for (let i = 0; i < 8; i++) {
      status = (await g.containerStatus(containerId)).status_code;
      if (status !== "IN_PROGRESS") break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (status === "IN_PROGRESS") {
      await update(post.id, {
        status: "scheduled",
        next_attempt_at: new Date(Date.now() + 2 * 60_000).toISOString(),
        locked_at: null,
      });
      return "retry";
    }
    if (status !== "FINISHED") throw new GraphError(`עיבוד המדיה במטא נכשל (${status})`, 400);

    const pub = await g.publishContainer(igId, containerId);
    await update(post.id, { ig_media_id: pub.id, status: "published", published_at: new Date().toISOString() });
    let permalink: string | null = null;
    try {
      permalink = (await g.mediaInfo(pub.id)).permalink ?? null;
    } catch {
      /* non-critical */
    }
    await update(post.id, { ig_permalink: permalink, last_error: null, locked_at: null });
    await log("info", "publish.live", `פורסם באינסטגרם ${permalink ?? pub.id}`, { postId: post.id });
    return "published";
  } catch (e) {
    return handleError(post, e, "live");
  }
}

async function handleError(post: Post, e: unknown, phase: string): Promise<PublishOutcome> {
  // Network errors/timeouts are retryable; Graph errors decide by their code.
  const retryable = e instanceof GraphError ? e.retryable : true;
  const msg = errMsg(e);
  if (retryable && post.attempt_count < MAX_ATTEMPTS) {
    const wait = BACKOFF_MIN[Math.min(post.attempt_count - 1, BACKOFF_MIN.length - 1)] ?? 30;
    await update(post.id, {
      status: "scheduled",
      next_attempt_at: new Date(Date.now() + wait * 60_000).toISOString(),
      last_error: msg,
      locked_at: null,
    });
    await log("warn", `publish.${phase}.retry`, `ניסיון ${post.attempt_count} נכשל, ניסיון נוסף בעוד ${wait} דק׳: ${msg}`, {
      postId: post.id,
    });
    return "retry";
  }
  await update(post.id, { status: "failed", last_error: msg, locked_at: null });
  await log("error", `publish.${phase}.failed`, `הפרסום נכשל סופית: ${msg}`, { postId: post.id });
  return "failed";
}

/** Instagram fetches the image itself, so it must be publicly reachable JPEG within allowed aspect ratios. */
async function assertImageFetchable(url: string, w: number | null, h: number | null) {
  const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!res.ok) throw new Error(`התמונה אינה נגישה ציבורית (HTTP ${res.status})`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("jpeg")) throw new Error(`אינסטגרם דורש JPEG, התקבל ${type}`);
  if (w && h) {
    const ratio = w / h;
    if (ratio < 0.8 - 0.01 || ratio > 1.91 + 0.01) throw new Error(`יחס תמונה ${ratio.toFixed(2)} מחוץ לטווח 4:5–1.91:1`);
  }
}

/** Posts stuck in 'publishing' (crash/timeout) go back to the queue; the container logic prevents duplicates. */
export async function recoverStuck(): Promise<number> {
  const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data } = await db()
    .from("posts")
    .update({ status: "scheduled", locked_at: null, next_attempt_at: new Date().toISOString() })
    .eq("status", "publishing")
    .lt("locked_at", cutoff)
    .select("id");
  if (data?.length) await log("warn", "publish.recover", `${data.length} פוסטים תקועים הוחזרו לתור`);
  return data?.length ?? 0;
}
