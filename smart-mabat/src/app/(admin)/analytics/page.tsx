import Link from "next/link";
import { DateTime } from "luxon";
import { Empty, PageHeader, Stat, str, type SP } from "@/components/ui";
import { categoryPerformance, postsWithLatestInsights } from "@/lib/analytics/insights";
import { categoryLabel } from "@/lib/content/topics";
import { db } from "@/lib/db";
import { categoryWeights } from "@/lib/scheduler/strategy";
import { formatIL, TZ } from "@/lib/scheduler/slots";
import { getConnection } from "@/lib/settings";

const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("he-IL"));

export default async function AnalyticsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const offset = Number(str(sp.w) ?? 0) || 0;
  const today = DateTime.now().setZone(TZ).startOf("day");
  const start = today.minus({ days: today.weekday % 7 }).plus({ weeks: offset });
  const end = start.plus({ days: 7 });

  const [conn, week, perf, recent] = await Promise.all([
    getConnection(),
    postsWithLatestInsights(start.toUTC().toISO()!, end.toUTC().toISO()!),
    categoryPerformance(),
    db().from("posts").select("category").neq("status", "rejected").order("created_at", { ascending: false }).limit(5),
  ]);
  const live = week.filter((p) => p.status === "published");
  const sim = week.filter((p) => p.status === "simulated");
  const sum = (k: "reach" | "likes" | "comments" | "saved" | "shares") => live.reduce((s, p) => s + (p.insight?.[k] ?? 0), 0);
  const measured = live.filter((p) => p.insight);
  const top = [...measured].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const weights = categoryWeights(perf, (recent.data ?? []).map((r) => r.category ?? "")).sort((a, b) => b.weight - a.weight);
  const maxW = Math.max(...weights.map((w) => w.weight), 1);

  return (
    <div className="space-y-5">
      <PageHeader title="ביצועים" subtitle={`דוח שבועי · ${start.toFormat("dd/LL")}–${end.minus({ days: 1 }).toFormat("dd/LL")}`} />
      <div className="flex gap-2">
        <Link href={`/analytics?w=${offset - 1}`} className="btn-ghost min-h-9">→ שבוע קודם</Link>
        <Link href="/analytics" className="btn-ghost min-h-9">השבוע</Link>
        <Link href={`/analytics?w=${offset + 1}`} className="btn-ghost min-h-9">שבוע הבא ←</Link>
      </div>

      {!conn.permissions_ok && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          נתוני חשיפה ומעורבות נשלפים מ-Meta רק עבור פוסטים שפורסמו בפועל, אחרי חיבור אינסטגרם. בינתיים מוצגים כאן רק פוסטים וסימולציות.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="פורסמו באינסטגרם" value={live.length} hint={`${sim.length} סימולציות`} />
        <Stat label="חשיפה (Reach)" value={measured.length ? n(sum("reach")) : "—"} />
        <Stat label="לייקים + תגובות" value={measured.length ? n(sum("likes") + sum("comments")) : "—"} />
        <Stat label="שמירות + שיתופים" value={measured.length ? n(sum("saved") + sum("shares")) : "—"} />
      </div>

      {top && (
        <section className="card">
          <div className="text-xs text-mute">הפוסט המוצלח של השבוע</div>
          <Link href={`/posts/${top.id}`} className="mt-1 block font-bold hover:text-tech-glow">{top.topic}</Link>
          <div className="mt-1 text-sm text-mute">
            חשיפה {n(top.insight?.reach)} · לייקים {n(top.insight?.likes)} · תגובות {n(top.insight?.comments)} · שמירות {n(top.insight?.saved)}
          </div>
        </section>
      )}

      <section className="card">
        <h2 className="h2">תוכנית התוכן של הסוכן</h2>
        <p className="mt-1 mb-4 text-sm text-mute">
          משקל גבוה = הסוכן יבחר בנושא לעיתים קרובות יותר. המשקלים מתעדכנים לפי מעורבות-לחשיפה של פוסטים אמיתיים, עם עדיפות לגיוון.
        </p>
        <ul className="space-y-2.5">
          {weights.map((w) => (
            <li key={w.key} title={`${categoryLabel(w.key)}: ${w.weight} · ${w.reason}`}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{categoryLabel(w.key)}</span>
                <span className="tabular-nums text-mute">{w.weight.toFixed(2)}</span>
              </div>
              <div className="h-2 rounded-full bg-ink-800">
                <div className="h-2 rounded-full bg-tech" style={{ width: `${Math.max(3, (w.weight / maxW) * 100)}%` }} />
              </div>
              <div className="mt-0.5 text-[11px] text-mute">{w.reason}</div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="h2 mb-3">פוסטים בשבוע</h2>
        {week.length ? (
          <div className="card overflow-x-auto p-0">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-line text-xs text-mute">
                <tr>
                  <th className="p-3 text-right font-medium">פוסט</th>
                  <th className="p-3 text-right font-medium">מועד</th>
                  <th className="p-3 text-right font-medium">חשיפה</th>
                  <th className="p-3 text-right font-medium">לייקים</th>
                  <th className="p-3 text-right font-medium">תגובות</th>
                  <th className="p-3 text-right font-medium">שמירות</th>
                </tr>
              </thead>
              <tbody>
                {week.map((p) => (
                  <tr key={p.id} className="border-b border-line/60 last:border-0">
                    <td className="max-w-56 p-3">
                      <Link href={`/posts/${p.id}`} className="line-clamp-1 hover:text-tech-glow">{p.topic}</Link>
                      <span className="text-[11px] text-mute">{p.status === "simulated" ? "סימולציה" : categoryLabel(p.category)}</span>
                    </td>
                    <td className="p-3 text-mute tabular-nums">{formatIL(p.published_at, false)}</td>
                    <td className="p-3 tabular-nums">{n(p.insight?.reach)}</td>
                    <td className="p-3 tabular-nums">{n(p.insight?.likes)}</td>
                    <td className="p-3 tabular-nums">{n(p.insight?.comments)}</td>
                    <td className="p-3 tabular-nums">{n(p.insight?.saved)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>אין פוסטים בשבוע הזה</Empty>
        )}
      </section>
    </div>
  );
}
