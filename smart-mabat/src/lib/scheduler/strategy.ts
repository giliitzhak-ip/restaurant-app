import { CATEGORIES } from "../content/topics";

export interface CategoryPerformance {
  category: string;
  posts: number;
  avgScore: number; // engagement per reach
}

export interface CategoryWeight {
  key: string;
  weight: number;
  reason: string;
}

/** Engagement score for one post: weighted interactions per reach. */
export function engagementScore(i: { reach?: number | null; likes?: number | null; comments?: number | null; saved?: number | null; shares?: number | null }): number {
  const interactions = (i.likes ?? 0) + 2 * (i.comments ?? 0) + 3 * (i.saved ?? 0) + 3 * (i.shares ?? 0);
  return interactions / Math.max(i.reach ?? 0, 1);
}

/**
 * Adaptive content plan:
 *  - categories with ≥2 measured posts get weight relative to the average (0.5×–2×)
 *  - categories used in the last 3 posts are strongly down-weighted (variety)
 *  - unmeasured categories keep weight 1 (exploration)
 */
export function categoryWeights(perf: CategoryPerformance[], recentCategories: string[]): CategoryWeight[] {
  const measured = perf.filter((p) => p.posts >= 2);
  const mean = measured.length ? measured.reduce((s, p) => s + p.avgScore, 0) / measured.length : 0;
  return CATEGORIES.map((c) => {
    let weight = 1;
    let reason = "אין מספיק נתונים";
    const p = measured.find((m) => m.category === c.key);
    if (p && mean > 0) {
      weight = Math.min(2, Math.max(0.5, p.avgScore / mean));
      reason = `ביצועים ${weight >= 1 ? "מעל" : "מתחת"} לממוצע (${p.posts} פוסטים)`;
    }
    const idx = recentCategories.slice(0, 3).indexOf(c.key);
    if (idx !== -1) {
      weight *= 0.15;
      reason += " · פורסם לאחרונה";
    }
    return { key: c.key, weight: Number(weight.toFixed(3)), reason };
  });
}

export function pickWeighted(weights: CategoryWeight[], rand: () => number = Math.random): string {
  const total = weights.reduce((s, w) => s + w.weight, 0);
  let r = rand() * total;
  for (const w of weights) {
    r -= w.weight;
    if (r <= 0) return w.key;
  }
  return weights[weights.length - 1].key;
}
