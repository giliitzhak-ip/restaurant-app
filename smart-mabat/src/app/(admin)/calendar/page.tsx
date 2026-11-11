import Link from "next/link";
import { DateTime } from "luxon";
import { StatusBadge, PageHeader, str, type SP } from "@/components/ui";
import { db } from "@/lib/db";
import { slotsForWeek, TZ } from "@/lib/scheduler/slots";
import { getSettings } from "@/lib/settings";
import type { Post } from "@/lib/types";

export default async function CalendarPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const offset = Number(str(sp.w) ?? 0) || 0;
  const settings = await getSettings();
  const today = DateTime.now().setZone(TZ).startOf("day");
  const start = today.minus({ days: today.weekday % 7 }).plus({ weeks: offset }); // Sunday
  const end = start.plus({ days: 7 });

  const { data } = await db()
    .from("posts")
    .select("id, status, topic, scheduled_at, published_at")
    .neq("status", "rejected")
    .or(
      `and(scheduled_at.gte.${start.toUTC().toISO()},scheduled_at.lt.${end.toUTC().toISO()}),and(published_at.gte.${start.toUTC().toISO()},published_at.lt.${end.toUTC().toISO()})`,
    );
  const posts = (data ?? []) as Pick<Post, "id" | "status" | "topic" | "scheduled_at" | "published_at">[];
  const slots = slotsForWeek(start, settings).map((s) => s.toMillis());

  const days = Array.from({ length: 7 }, (_, i) => start.plus({ days: i }));
  const label = `${start.setLocale("he").toFormat("dd/LL")} – ${end.minus({ days: 1 }).setLocale("he").toFormat("dd/LL")}`;

  return (
    <div>
      <PageHeader title="לוח פרסומים" subtitle={`שבוע ${label} · שעון ישראל`} />
      <div className="mb-4 flex gap-2">
        <Link href={`/calendar?w=${offset - 1}`} className="btn-ghost min-h-9">
          → שבוע קודם
        </Link>
        <Link href="/calendar" className="btn-ghost min-h-9">
          השבוע
        </Link>
        <Link href={`/calendar?w=${offset + 1}`} className="btn-ghost min-h-9">
          שבוע הבא ←
        </Link>
      </div>
      <div className="space-y-2">
        {days.map((d) => {
          const dayPosts = posts
            .filter((p) => {
              const t = DateTime.fromISO((p.published_at ?? p.scheduled_at)!).setZone(TZ);
              return t.hasSame(d, "day");
            })
            .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
          const daySlots = slots.filter((s) => DateTime.fromMillis(s).setZone(TZ).hasSame(d, "day"));
          const isToday = d.hasSame(today, "day");
          return (
            <div key={d.toISODate()} className={`card flex gap-3 ${isToday ? "border-tech/50" : ""}`}>
              <div className="w-14 shrink-0 text-center">
                <div className="text-xs text-mute">{d.setLocale("he").toFormat("cccc")}</div>
                <div className={`text-xl font-bold ${isToday ? "text-tech-glow" : ""}`}>{d.toFormat("dd")}</div>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                {dayPosts.map((p) => (
                  <Link key={p.id} href={`/posts/${p.id}`} className="flex items-center gap-2 rounded-lg bg-ink-800 px-3 py-2 text-sm hover:bg-ink-700">
                    <span className="tabular-nums text-mute">{DateTime.fromISO((p.published_at ?? p.scheduled_at)!).setZone(TZ).toFormat("HH:mm")}</span>
                    <span className="line-clamp-1 flex-1">{p.topic ?? "פוסט"}</span>
                    <StatusBadge status={p.status} />
                  </Link>
                ))}
                {daySlots
                  .filter((s) => s > Date.now() && !dayPosts.some((p) => p.scheduled_at && new Date(p.scheduled_at).getTime() === s))
                  .map((s) => (
                    <div key={s} className="rounded-lg border border-dashed border-line px-3 py-2 text-sm text-mute">
                      {DateTime.fromMillis(s).setZone(TZ).toFormat("HH:mm")} · משבצת פנויה{settings.agent_enabled ? " – הסוכן ימלא" : ""}
                    </div>
                  ))}
                {!dayPosts.length && !daySlots.length && <div className="py-2 text-sm text-mute/60">—</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
