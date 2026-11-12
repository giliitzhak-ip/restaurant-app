import Link from "next/link";
import { PageHeader, str, type SP } from "@/components/ui";
import { db } from "@/lib/db";
import { formatIL } from "@/lib/scheduler/slots";

const LEVEL_STYLE: Record<string, string> = {
  error: "text-red-300",
  warn: "text-amber-300",
  info: "text-soft",
  debug: "text-mute",
};

export default async function LogsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const level = str(sp.level);
  let q = db().from("activity_log").select("*").order("created_at", { ascending: false }).limit(200);
  if (level === "error") q = q.eq("level", "error");
  if (level === "warn") q = q.in("level", ["warn", "error"]);
  const [{ data: logs }, { data: runs }] = await Promise.all([
    q,
    db().from("agent_runs").select("*").order("started_at", { ascending: false }).limit(10),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader title="יומן פעולות" subtitle="כל פעולה ושגיאה במערכת" />
      <section className="card">
        <h2 className="h2 mb-3">ריצות אחרונות של הסוכן</h2>
        <ul className="space-y-2 text-sm">
          {(runs ?? []).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2">
              <span className={r.ok ? "text-emerald-400" : r.ok === false ? "text-red-400" : "text-mute"}>{r.ok ? "✓" : r.ok === false ? "✕" : "…"}</span>
              <span className="tabular-nums text-mute">{formatIL(r.started_at, false)}</span>
              <span className="text-xs text-mute">{r.trigger}</span>
              <span className="text-xs">{r.summary?.skipped ?? ""}</span>
              {r.summary?.errors?.length > 0 && <span className="text-xs text-red-300">{r.summary.errors.join("; ")}</span>}
            </li>
          ))}
          {!runs?.length && <li className="text-mute">אין ריצות עדיין</li>}
        </ul>
      </section>
      <div className="flex gap-2">
        {[
          { k: "", l: "הכול" },
          { k: "warn", l: "אזהרות ושגיאות" },
          { k: "error", l: "שגיאות" },
        ].map((t) => (
          <Link key={t.k} href={`/logs${t.k ? `?level=${t.k}` : ""}`} className={`rounded-full border px-3.5 py-1.5 text-sm ${(level ?? "") === t.k ? "border-tech bg-tech/15" : "border-line text-mute"}`}>
            {t.l}
          </Link>
        ))}
      </div>
      <div className="card p-0">
        <ul className="divide-y divide-line/60 text-sm">
          {(logs ?? []).map((l) => (
            <li key={l.id} className="flex flex-col gap-0.5 p-3 sm:flex-row sm:gap-3">
              <span className="shrink-0 text-xs text-mute tabular-nums sm:w-32">{formatIL(l.created_at, false)}</span>
              <span className="shrink-0 font-mono text-[11px] text-mute sm:w-40" dir="ltr">{l.event}</span>
              <span className={`flex-1 ${LEVEL_STYLE[l.level]}`}>
                {l.message}
                {l.post_id && (
                  <Link href={`/posts/${l.post_id}`} className="mr-2 text-xs text-tech-glow">
                    לפוסט
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
