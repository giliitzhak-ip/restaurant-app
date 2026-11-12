"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generatePost } from "@/lib/agent";
import { requireAdmin } from "@/lib/auth";
import { fingerprint } from "@/lib/content/similarity";
import { db, must } from "@/lib/db";
import { createPostImage, getMedia, makeBranded, downloadMedia } from "@/lib/images/media";
import { processClaimedPost, recheck } from "@/lib/instagram/publisher";
import { errMsg, log } from "@/lib/logger";
import { localInputToUtc } from "@/lib/scheduler/slots";
import { getSettings } from "@/lib/settings";
import type { Post } from "@/lib/types";

function back(path: string, kind: "ok" | "err", msg: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}`);
}

async function loadPost(id: string): Promise<Post> {
  return must(await db().from("posts").select("*").eq("id", id).single(), "load post") as Post;
}

function parseHashtags(s: string): string[] {
  return s
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : `#${t}`));
}

/** "צור פוסט עכשיו" — runs the AI agent once. */
export async function generateNow(form: FormData) {
  await requireAdmin();
  const category = String(form.get("category") ?? "") || undefined;
  const when = localInputToUtc(String(form.get("scheduled_at") ?? ""));
  let id: string;
  try {
    id = (await generatePost({ scheduledAt: when, category })).id;
  } catch (e) {
    back("/posts/new", "err", errMsg(e));
  }
  revalidatePath("/", "layout");
  redirect(`/posts/${id}?ok=${encodeURIComponent("הפוסט נוצר")}`);
}

/** Post written by you. */
export async function createManualPost(form: FormData) {
  await requireAdmin();
  const settings = await getSettings();
  const caption = String(form.get("caption") ?? "").trim();
  const headline = String(form.get("headline") ?? "").trim() || null;
  const mediaId = String(form.get("media_id") ?? "") || null;
  if (caption.length < 20) back("/posts/new", "err", "הטקסט קצר מדי");

  let finalMedia: string | null = null;
  try {
    if (mediaId) {
      const src = await getMedia(mediaId);
      if (src) finalMedia = (await makeBranded(await downloadMedia(src), settings, headline, { parentId: src.id, title: headline ?? "פוסט ידני" })).id;
    } else if (form.get("ai_image") === "on") {
      finalMedia = (await createPostImage({ ...settings, image_mode: "ai" }, { prompt: String(form.get("image_prompt") ?? "") || null, headline, title: headline ?? "פוסט ידני" }))?.id ?? null;
    }
  } catch (e) {
    back("/posts/new", "err", `יצירת תמונה נכשלה: ${errMsg(e)}`);
  }

  const row = must(
    await db()
      .from("posts")
      .insert({
        status: "draft",
        caption,
        headline,
        hashtags: parseHashtags(String(form.get("hashtags") ?? "")),
        cta: settings.cta_text,
        media_id: finalMedia,
        scheduled_at: localInputToUtc(String(form.get("scheduled_at") ?? "")),
        fingerprint: `${fingerprint(caption)}:manual:${Date.now()}`,
        created_by: "admin",
        topic: headline,
      })
      .select("*")
      .single(),
    "create post",
  ) as Post;
  await recheck(row);
  await log("info", "post.create", "נוצר פוסט ידני", { postId: row.id });
  revalidatePath("/", "layout");
  redirect(`/posts/${row.id}?ok=${encodeURIComponent("נשמר כטיוטה")}`);
}

export async function savePost(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id"));
  const post = await loadPost(id);
  if (["published", "publishing"].includes(post.status)) back(`/posts/${id}`, "err", "לא ניתן לערוך פוסט שפורסם");
  const caption = String(form.get("caption") ?? "").trim();
  const patch: Partial<Post> = {
    caption,
    headline: String(form.get("headline") ?? "").trim() || null,
    hashtags: parseHashtags(String(form.get("hashtags") ?? "")),
    alt_text: String(form.get("alt_text") ?? "").trim() || null,
    scheduled_at: localInputToUtc(String(form.get("scheduled_at") ?? "")),
  };
  // Editing a scheduled post sends it back for approval — nothing unchecked goes out.
  if (post.status === "scheduled") patch.status = "pending_approval";
  must(await db().from("posts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id), "save post");
  const { ok } = await recheck({ ...post, ...patch } as Post);
  await log("info", "post.edit", "הפוסט נערך", { postId: id });
  revalidatePath("/", "layout");
  back(`/posts/${id}`, ok ? "ok" : "err", ok ? "נשמר ועבר בדיקות" : "נשמר, אבל יש בדיקות שנכשלו");
}

export async function approvePost(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id"));
  const post = await loadPost(id);
  const { ok } = await recheck(post);
  if (!ok) back(`/posts/${id}`, "err", "לא ניתן לאשר – יש בדיקות שנכשלו");
  let when = post.scheduled_at;
  if (!when || new Date(when).getTime() < Date.now()) when = new Date(Date.now() + 10 * 60_000).toISOString();
  must(
    await db()
      .from("posts")
      .update({ status: "scheduled", scheduled_at: when, attempt_count: 0, next_attempt_at: null, last_error: null, updated_at: new Date().toISOString() })
      .eq("id", id),
    "approve",
  );
  await log("info", "post.approve", "הפוסט אושר ותוזמן", { postId: id });
  revalidatePath("/", "layout");
  back(`/posts/${id}`, "ok", "אושר ונכנס לתור");
}

export async function rejectPost(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id"));
  must(await db().from("posts").update({ status: "rejected", updated_at: new Date().toISOString() }).eq("id", id).not("status", "in", "(published,publishing)"), "reject");
  await log("info", "post.reject", "הפוסט נדחה", { postId: id });
  revalidatePath("/", "layout");
  back(`/posts/${id}`, "ok", "הפוסט נדחה");
}

export async function backToDraft(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id"));
  must(await db().from("posts").update({ status: "draft", updated_at: new Date().toISOString() }).eq("id", id).in("status", ["scheduled", "pending_approval", "failed", "rejected"]), "draft");
  revalidatePath("/", "layout");
  back(`/posts/${id}`, "ok", "הוחזר לטיוטה");
}

export async function deletePost(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id"));
  must(await db().from("posts").delete().eq("id", id).not("status", "in", "(published,publishing)"), "delete");
  await log("info", "post.delete", "פוסט נמחק", { postId: id });
  revalidatePath("/", "layout");
  redirect("/posts?ok=" + encodeURIComponent("נמחק"));
}

/** Publish (or simulate, in test mode) right now. Still requires passing checks. */
export async function publishNow(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id"));
  const post = await loadPost(id);
  const { ok } = await recheck(post);
  if (!ok) back(`/posts/${id}`, "err", "לא ניתן לפרסם – יש בדיקות שנכשלו");
  if (post.status !== "scheduled" && post.status !== "failed") {
    must(await db().from("posts").update({ status: "scheduled", attempt_count: 0 }).eq("id", id), "queue");
  }
  const { data: claimed } = await db().rpc("claim_post", { p_id: id });
  const p = (claimed as Post[] | null)?.[0];
  if (!p) back(`/posts/${id}`, "err", "הפוסט כבר בטיפול או שאינו זמין לפרסום");
  const outcome = await processClaimedPost(p);
  revalidatePath("/", "layout");
  const msg: Record<string, string> = {
    published: "פורסם באינסטגרם ✅",
    simulated: "מצב בדיקות: הסימולציה עברה. לא פורסם באינסטגרם.",
    retry: "נכשל זמנית – ינסה שוב אוטומטית",
    failed: "הפרסום נכשל – ראו שגיאה",
    blocked: "נחסם בבדיקות תוכן",
  };
  back(`/posts/${id}`, outcome === "failed" || outcome === "blocked" ? "err" : "ok", msg[outcome]);
}

export async function regenerateImage(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id"));
  const post = await loadPost(id);
  const settings = await getSettings();
  try {
    const img = await createPostImage({ ...settings, image_mode: "ai" }, { prompt: post.image_prompt, headline: post.headline, title: post.topic ?? "פוסט" });
    await db().from("posts").update({ media_id: img?.id ?? null, status: post.status === "scheduled" ? "pending_approval" : post.status }).eq("id", id);
    await recheck({ ...post, media_id: img?.id ?? null });
  } catch (e) {
    back(`/posts/${id}`, "err", `יצירת תמונה נכשלה: ${errMsg(e)}`);
  }
  revalidatePath("/", "layout");
  back(`/posts/${id}`, "ok", "נוצרה תמונה חדשה");
}

export async function useLibraryImage(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id"));
  const mediaId = String(form.get("media_id"));
  const post = await loadPost(id);
  const settings = await getSettings();
  const src = await getMedia(mediaId);
  if (!src) back(`/posts/${id}`, "err", "התמונה לא נמצאה");
  try {
    const branded = await makeBranded(await downloadMedia(src), settings, post.headline, { parentId: src.id, title: post.topic ?? "פוסט" });
    await db().from("posts").update({ media_id: branded.id, status: post.status === "scheduled" ? "pending_approval" : post.status }).eq("id", id);
    await recheck({ ...post, media_id: branded.id });
  } catch (e) {
    back(`/posts/${id}`, "err", errMsg(e));
  }
  revalidatePath("/", "layout");
  back(`/posts/${id}`, "ok", "התמונה עודכנה");
}
