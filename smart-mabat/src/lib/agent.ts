import "server-only";
import { randomUUID } from "node:crypto";
import { getContentProvider } from "./ai/content-provider";
import { categoryPerformance, refreshInsights } from "./analytics/insights";
import { checksPassed, runChecks } from "./content/checks";
import { fingerprint } from "./content/similarity";
import { CATEGORIES } from "./content/topics";
import { db, must } from "./db";
import { createPostImage } from "./images/media";
import { maybeRefreshToken } from "./instagram/connection";
import { processClaimedPost, recoverStuck, type PublishOutcome } from "./instagram/publisher";
import { errMsg, log } from "./logger";
import { categoryWeights, pickWeighted } from "./scheduler/strategy";
import { upcomingSlots } from "./scheduler/slots";
import { getSettings } from "./settings";
import type { Post, PostStatus, Settings } from "./types";

/** Statuses that "occupy" a time slot (so the planner won't generate another post for it). */
const SLOT_TAKEN: PostStatus[] = ["draft", "pending_approval", "scheduled", "publishing", "published", "simulated", "failed"];

async function recentPosts(limit = 40) {
  const { data } = await db()
    .from("posts")
    .select("id, topic, hook, caption, category, status")
    .neq("status", "rejected")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

/**
 * Generate one post with the AI agent: pick a topic, write, create the image, run checks,
 * and store it with a status that matches the approval mode.
 */
export async function generatePost(opts: { scheduledAt: string | null; category?: string; settings?: Settings }): Promise<Post> {
  const settings = opts.settings ?? (await getSettings());
  const recent = await recentPosts();
  const provider = getContentProvider();

  const weights = categoryWeights(await categoryPerformance(), recent.map((r) => r.category ?? ""));
  const categoryKey = opts.category ?? pickWeighted(weights);
  const category = CATEGORIES.find((c) => c.key === categoryKey) ?? CATEGORIES[0];

  let avoidNote: string | undefined;
  let lastErr = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const gen = await provider.generate({
      categoryKey: category.key,
      categoryLabel: category.label,
      angleSuggestions: category.angles,
      recentTopics: recent.map((r) => r.topic).filter(Boolean).slice(0, 25) as string[],
      settings,
      avoidNote,
    });

    // Text checks first (cheap) — only make an image for text that passes.
    const textChecks = runChecks({
      caption: gen.caption,
      hashtags: gen.hashtags,
      cta: gen.cta,
      createdBy: "agent",
      hasMedia: true,
      mediaType: "IMAGE",
      recentCaptions: recent.map((r) => r.caption),
    });
    const failing = textChecks.filter((c) => !c.ok && c.severity === "error");
    if (failing.length && attempt === 1) {
      avoidNote = failing.map((f) => `${f.label}${f.detail ? ` (${f.detail})` : ""}`).join("; ");
      lastErr = avoidNote;
      await log("info", "agent.regenerate", `ניסיון ראשון נפסל: ${avoidNote}`);
      continue;
    }

    let mediaId: string | null = null;
    try {
      const img = await createPostImage(settings, { prompt: gen.image_prompt, headline: gen.headline, title: gen.topic });
      mediaId = img?.id ?? null;
    } catch (e) {
      await log("error", "agent.image", `יצירת תמונה נכשלה: ${errMsg(e)}`);
    }

    const checks = runChecks({
      caption: gen.caption,
      hashtags: gen.hashtags,
      cta: gen.cta,
      createdBy: "agent",
      hasMedia: Boolean(mediaId),
      mediaType: "IMAGE",
      recentCaptions: recent.map((r) => r.caption),
    });
    const passed = checksPassed(checks);
    const status: PostStatus =
      settings.approval_mode === "draft"
        ? "draft"
        : settings.approval_mode === "auto" && passed && opts.scheduledAt
          ? "scheduled"
          : "pending_approval";

    let fp = fingerprint(gen.caption);
    const { data: dup } = await db().from("posts").select("id").eq("fingerprint", fp).neq("status", "rejected").limit(1);
    if (dup?.length) fp = `${fp}:${randomUUID()}`; // keep row, the not_duplicate check already flags it

    const row = must(
      await db()
        .from("posts")
        .insert({
          status,
          category: category.key,
          topic: gen.topic,
          hook: gen.hook,
          caption: gen.caption,
          hashtags: gen.hashtags,
          cta: gen.cta,
          headline: gen.headline,
          image_prompt: gen.image_prompt,
          alt_text: gen.alt_text,
          media_id: mediaId,
          scheduled_at: opts.scheduledAt,
          checks,
          checks_passed: passed,
          fingerprint: fp,
          ai_model: `${provider.name}:${provider.model}`,
          created_by: "agent",
        })
        .select("*")
        .single(),
      "insert post",
    ) as Post;

    await log(passed ? "info" : "warn", "agent.generate", `נוצר פוסט "${gen.topic}" (${status}${passed ? "" : ", לא עבר בדיקות"})`, {
      postId: row.id,
      meta: { provider: provider.name, category: category.key },
    });
    return row;
  }
  throw new Error(`יצירת הפוסט נכשלה: ${lastErr}`);
}

export interface TickSummary {
  ok: boolean;
  skipped?: string;
  recovered?: number;
  generated?: string[];
  published?: Record<string, PublishOutcome>;
  insights?: number;
  token?: string | null;
  errors: string[];
}

const MAX_GENERATE_PER_TICK = 1; // keeps each run well under serverless time limits
const MAX_PUBLISH_PER_TICK = 2;

/** One agent cycle. Safe to call as often as you like — overlapping calls are rejected by a lease. */
export async function runTick(trigger: string): Promise<TickSummary> {
  const holder = randomUUID();
  const { data: gotLease } = await db().rpc("acquire_agent_lease", { p_holder: holder, p_seconds: 280 });
  if (!gotLease) return { ok: true, skipped: "ריצה אחרת פעילה", errors: [] };

  const run = must(await db().from("agent_runs").insert({ trigger }).select("id").single(), "start run") as { id: number };
  const summary: TickSummary = { ok: true, errors: [] };

  try {
    const settings = await getSettings();
    summary.recovered = await recoverStuck();

    if (!settings.agent_enabled) {
      summary.skipped = "הסוכן כבוי";
    } else {
      // 1) Plan: fill empty upcoming slots.
      summary.generated = [];
      const slots = upcomingSlots(settings, settings.plan_ahead_days);
      if (slots.length) {
        const { data: taken } = await db()
          .from("posts")
          .select("scheduled_at")
          .in("status", SLOT_TAKEN)
          .gte("scheduled_at", slots[0])
          .lte("scheduled_at", slots[slots.length - 1]);
        const takenSet = new Set((taken ?? []).map((t) => new Date(t.scheduled_at).toISOString()));
        const free = slots.filter((s) => !takenSet.has(new Date(s).toISOString()));
        for (const slot of free.slice(0, MAX_GENERATE_PER_TICK)) {
          try {
            const p = await generatePost({ scheduledAt: slot, settings });
            summary.generated.push(p.id);
          } catch (e) {
            summary.errors.push(errMsg(e));
            await log("error", "agent.generate", errMsg(e));
          }
        }
      }

      // 2) Publish due posts (test mode = simulation).
      summary.published = {};
      const { data: claimed, error } = await db().rpc("claim_due_posts", { p_limit: MAX_PUBLISH_PER_TICK });
      if (error) throw new Error(`claim: ${error.message}`);
      for (const post of (claimed ?? []) as Post[]) {
        summary.published[post.id] = await processClaimedPost(post);
      }
    }

    // 3) Housekeeping (runs even when the agent is paused).
    summary.token = await maybeRefreshToken();
    summary.insights = await refreshInsights(5);
  } catch (e) {
    summary.ok = false;
    summary.errors.push(errMsg(e));
    await log("error", "agent.tick", errMsg(e));
  } finally {
    await db()
      .from("agent_runs")
      .update({ finished_at: new Date().toISOString(), ok: summary.ok && summary.errors.length === 0, summary })
      .eq("id", run.id);
    await db().rpc("release_agent_lease", { p_holder: holder });
  }
  return summary;
}
