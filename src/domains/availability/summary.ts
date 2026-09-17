import { withSystem } from '@/lib/db';

/**
 * The one availability line a provider sees, and the one a customer sees.
 *
 * Both screens ask the same question — "when can this provider work?" — so
 * they ask it in one place. The answer is computed in the database because it
 * depends on the weekly plan, date overrides, the realtime switch, accepted
 * jobs and the wall clock in the platform timezone; the browser's clock is
 * not a party to any of that (spec §11, §55).
 */
export interface AvailabilitySummary {
  /** Available right now. */
  availableNow: boolean;
  /** When the current open window ends, as local HH:MM. Null unless open. */
  openUntil: string | null;
  /** A declared end to the realtime shift ("accepting jobs until…"), ISO. */
  onlineUntil: string | null;
  /** Next moment this provider could start a job, ISO. Null if none ahead. */
  nextAvailableAt: string | null;
  /** The realtime switch. BUSY means holding an accepted job. */
  state: 'OFFLINE' | 'ONLINE' | 'BUSY';
  /**
   * Whether any weekly hours are declared at all.
   *
   * This is the difference between "not available then" and "we do not know",
   * and the two must not be phrased the same way. A provider who never set
   * hours has no future availability we can assert — saying they have none is
   * a claim about their calendar that we have no basis for (spec §72).
   */
  hasPlan: boolean;
}

/**
 * Runs as the system rather than as the asking user on purpose: a customer
 * must be able to learn "available now, until 18:00" WITHOUT being able to
 * read the provider's schedule tables, so the only path to that answer is
 * this aggregate (spec §56). It returns no rule rows, no dates, no calendar.
 */
export async function availabilitySummary(
  providerId: string,
  durationMin: number | null = null,
): Promise<AvailabilitySummary> {
  const row = await withSystem((db) =>
    db.one<{
      available_now: boolean;
      open_until: string | null;
      online_until: Date | null;
      next_at: Date | null;
      state: 'OFFLINE' | 'ONLINE' | 'BUSY';
      has_plan: boolean;
    }>(
      `select
         provider_is_available_at($1, now(), $2) as available_now,
         (select online_until from provider_profiles where id = $1) as online_until,
         (select state::text from provider_profiles where id = $1) as state,
         exists (
           select 1 from provider_availability_rules r
            where r.provider_id = $1 and r.is_active
         ) as has_plan,
         provider_next_available_at($1, now(), $2) as next_at,
         to_char(
           coalesce(
             -- A date override for today wins, but only while we are inside it.
             (select o.ends_at from provider_availability_overrides o
               where o.provider_id = $1
                 and o.on_date = (now() at time zone availability_timezone())::date
                 and o.kind = 'window'
                 and (now() at time zone availability_timezone())::time
                     between o.starts_at and o.ends_at),
             -- Otherwise the weekly window we are currently inside.
             (select max(r.ends_at) from provider_availability_rules r
               where r.provider_id = $1 and r.is_active
                 and r.weekday = extract(dow from now() at time zone availability_timezone())::smallint
                 and (now() at time zone availability_timezone())::time
                     between r.starts_at and r.ends_at)
           ), 'HH24:MI') as open_until`,
      [providerId, durationMin],
    ),
  );

  return {
    availableNow: row?.available_now ?? false,
    // Only meaningful while actually open: "until 18:00" next to "unavailable"
    // is a contradiction, and the honest answer is the next opening instead.
    openUntil: row?.available_now ? (row?.open_until ?? null) : null,
    onlineUntil: row?.online_until ? row.online_until.toISOString() : null,
    nextAvailableAt: row?.next_at ? row.next_at.toISOString() : null,
    state: row?.state ?? 'OFFLINE',
    hasPlan: row?.has_plan ?? false,
  };
}

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function inZone(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, ...options }).format(date);
}

/**
 * Availability in human language, never as a calendar (spec §55).
 *
 * The customer is answering one question — can this person come when I need
 * them — and a grid of windows is a worse answer to it than a sentence. It
 * also happens to be the only answer we can give without exposing a
 * provider's personal schedule.
 */
export function availabilityPhrase(
  summary: AvailabilitySummary,
  now: Date,
  timeZone = 'Asia/Jerusalem',
): string {
  const clock = (date: Date) =>
    inZone(date, timeZone, { hour: '2-digit', minute: '2-digit', hour12: false });
  const day = (date: Date) =>
    inZone(date, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' });

  if (summary.availableNow) {
    // A declared shift end is the stricter of the two, and the one the
    // provider actually chose, so it wins over the planned window's end.
    const until = summary.onlineUntil
      ? clock(new Date(summary.onlineUntil))
      : summary.openUntil;
    return until ? `זמין עד ${until}` : 'זמין כרגע';
  }

  const nextPhrase = (): string | null => {
    if (!summary.nextAvailableAt) return null;
    const next = new Date(summary.nextAvailableAt);
    const nextDay = day(next);
    if (nextDay === day(now)) return `פנוי מ-${clock(next)}`;
    if (nextDay === day(new Date(now.getTime() + 86_400_000))) {
      return `פנוי מחר מ-${clock(next)}`;
    }
    const short = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(next);
    const name = DAYS_HE[DAYS_EN.indexOf(short)];
    return name ? `פנוי ביום ${name} מ-${clock(next)}` : `פנוי מ-${clock(next)}`;
  };

  // Currently on a job. Saying anything about the next fortnight here would
  // be answering a question nobody asked with a fact that is not true: they
  // are not unavailable for two weeks, they are busy for the next hour.
  if (summary.state === 'BUSY') {
    const next = nextPhrase();
    return next ? `בעבודה כרגע · ${next}` : 'בעבודה כרגע';
  }

  const next = nextPhrase();
  if (next) return next.replace(/^פנוי/, 'זמין');

  // No hours declared and not switched on: we genuinely do not know when they
  // work, which is a different statement from "they never work" (spec §72).
  if (!summary.hasPlan) return 'לא פרסם שעות קבועות';

  return 'אין זמינות בשבועיים הקרובים';
}
