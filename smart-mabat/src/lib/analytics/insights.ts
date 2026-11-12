import "server-only";
import { db } from "../db";
import { clientFor } from "../instagram/connection";
import { errMsg, log } from "../logger";
import { getConnection } from "../settings";
import { engagementScore, type CategoryPerformance } from "../scheduler/strategy";

const METRICS = ["reach", "likes", "comments", "saved", "shares", "views"];

/** Pull insights for real (live) posts from the last 30 days that weren't refreshed in 12h. */
export async function refreshInsights(limit = 5): Promise<number> {
  const conn = await getConnection();
  if (!conn.access_token_enc || !conn.permissions_ok) return 0;
  const g = clientFor(conn);

  const { data: posts } = await db()
    .from("posts")
    .select("id, ig_media_id, published_at")
    .eq("status", "published")
    .not("ig_media_id", "is", null)
    .gte("published_at", new Date(Date.now() - 30 * 864e5).toISOString())
    .order("published_at", { ascending: false })
    .limit(40);

  let done = 0;
  for (const p of posts ?? []) {
    if (done >= limit) break;
    const { data: last } = await db()
      .from("post_insights")
      .select("fetched_at")
      .eq("post_id", p.id)
      .order("fetched_at", { ascending: false })
      .limit(1);
    if (last?.[0] && Date.now() - new Date(last[0].fetched_at).getTime() < 12 * 3600e3) continue;

    try {
      const row: Record<string, number | null> = {};
      let raw: unknown = null;
      try {
        const r = await g.mediaInsights(p.ig_media_id!, METRICS);
        raw = r;
        for (const m of r.data) row[m.name] = m.total_value?.value ?? m.values?.[0]?.value ?? null;
      } catch (e) {
        // Insights permission missing or metric unsupported → fall back to public counts.
        const c = await g.mediaCounts(p.ig_media_id!);
        raw = { fallback: true, error: errMsg(e), ...c };
        row.likes = c.like_count ?? null;
        row.comments = c.comments_count ?? null;
      }
      await db().from("post_insights").insert({
        post_id: p.id,
        reach: row.reach ?? null,
        likes: row.likes ?? null,
        comments: row.comments ?? null,
        saved: row.saved ?? null,
        shares: row.shares ?? null,
        views: row.views ?? null,
        raw,
      });
      done++;
    } catch (e) {
      await log("warn", "insights.fetch", `שליפת נתונים נכשלה: ${errMsg(e)}`, { postId: p.id });
    }
  }
  return done;
}

export interface PostWithInsight {
  id: string;
  category: string | null;
  topic: string | null;
  caption: string;
  published_at: string | null;
  ig_permalink: string | null;
  status: string;
  insight: { reach: number | null; likes: number | null; comments: number | null; saved: number | null; shares: number | null; views: number | null } | null;
  score: number | null;
}

export async function postsWithLatestInsights(sinceIso: string, untilIso?: string): Promise<PostWithInsight[]> {
  let q = db()
    .from("posts")
    .select("id, category, topic, caption, published_at, ig_permalink, status, post_insights(reach, likes, comments, saved, shares, views, fetched_at)")
    .in("status", ["published", "simulated"])
    .gte("published_at", sinceIso)
    .order("published_at", { ascending: false });
  if (untilIso) q = q.lt("published_at", untilIso);
  const { data } = await q;
  return (data ?? []).map((p) => {
    type Row = NonNullable<PostWithInsight["insight"]> & { fetched_at: string };
    const ins = ((p.post_insights as Row[] | null) ?? []).sort((a, b) => b.fetched_at.localeCompare(a.fetched_at))[0];
    return {
      id: p.id,
      category: p.category,
      topic: p.topic,
      caption: p.caption,
      published_at: p.published_at,
      ig_permalink: p.ig_permalink,
      status: p.status,
      insight: ins ?? null,
      score: ins ? engagementScore(ins) : null,
    };
  });
}

export async function categoryPerformance(): Promise<CategoryPerformance[]> {
  const posts = await postsWithLatestInsights(new Date(Date.now() - 90 * 864e5).toISOString());
  const by = new Map<string, number[]>();
  for (const p of posts) {
    if (p.score === null || !p.category || !p.insight?.reach) continue;
    by.set(p.category, [...(by.get(p.category) ?? []), p.score]);
  }
  return [...by.entries()].map(([category, scores]) => ({
    category,
    posts: scores.length,
    avgScore: scores.reduce((a, b) => a + b, 0) / scores.length,
  }));
}
