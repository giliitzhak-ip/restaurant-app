import { DateTime } from "luxon";

export const TZ = "Asia/Jerusalem";

export interface SlotConfig {
  posts_per_week: number;
  publish_days: number[]; // ISO weekday 1=Mon … 7=Sun
  publish_times: string[]; // "HH:MM" Israel time
}

function parseTime(t: string): { hour: number; minute: number } | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(t.trim());
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : null;
}

/** Israeli week starts on Sunday. */
function weekStart(dt: DateTime): DateTime {
  const d = dt.setZone(TZ).startOf("day");
  return d.minus({ days: d.weekday % 7 }); // Sun → 0
}

/** All slots of one week, thinned evenly down to posts_per_week. */
export function slotsForWeek(anyDayInWeek: DateTime, cfg: SlotConfig): DateTime[] {
  const start = weekStart(anyDayInWeek);
  const times = cfg.publish_times.map(parseTime).filter((t): t is { hour: number; minute: number } => !!t);
  const candidates: DateTime[] = [];
  for (let i = 0; i < 7; i++) {
    const day = start.plus({ days: i });
    if (!cfg.publish_days.includes(day.weekday)) continue;
    for (const t of times) candidates.push(day.set({ hour: t.hour, minute: t.minute, second: 0, millisecond: 0 }));
  }
  candidates.sort((a, b) => a.toMillis() - b.toMillis());
  const n = Math.max(0, Math.min(cfg.posts_per_week, candidates.length));
  if (n === candidates.length) return candidates;
  const picked: DateTime[] = [];
  for (let i = 0; i < n; i++) picked.push(candidates[Math.floor((i * candidates.length) / n)]);
  return picked;
}

/** Upcoming slots between now(+lead) and now+days. Returned as UTC ISO strings. */
export function upcomingSlots(cfg: SlotConfig, days: number, now: DateTime = DateTime.now(), leadMinutes = 20): string[] {
  const from = now.plus({ minutes: leadMinutes });
  const to = now.plus({ days });
  const out: string[] = [];
  for (let w = weekStart(now); w <= to; w = w.plus({ weeks: 1 })) {
    for (const s of slotsForWeek(w, cfg)) if (s >= from && s <= to) out.push(s.toUTC().toISO()!);
  }
  return out;
}

export function formatIL(iso: string | null | undefined, withDay = true): string {
  if (!iso) return "—";
  return DateTime.fromISO(iso)
    .setZone(TZ)
    .setLocale("he")
    .toFormat(withDay ? "cccc dd/LL HH:mm" : "dd/LL/yyyy HH:mm");
}

/** "2025-01-01T19:00" (datetime-local, Israel time) → UTC ISO */
export function localInputToUtc(value: string): string | null {
  const dt = DateTime.fromISO(value, { zone: TZ });
  return dt.isValid ? dt.toUTC().toISO() : null;
}

export function utcToLocalInput(iso: string | null): string {
  if (!iso) return "";
  return DateTime.fromISO(iso).setZone(TZ).toFormat("yyyy-LL-dd'T'HH:mm");
}
