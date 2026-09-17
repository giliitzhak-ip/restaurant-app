import { z } from 'zod';
import { ApiError, handleError, ok, parseJson } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { withUser } from '@/lib/db';
import { availabilitySummary, availabilityPhrase } from '@/domains/availability/summary';
import { logOperation, newRequestId } from '@/lib/logger';

/**
 * Provider availability management (spec §9, §13).
 *
 * Two concepts, kept apart deliberately:
 *   - the weekly PLAN  (rules)      → "when do I work?"
 *   - date OVERRIDES   (overrides)  → "is a specific day different?"
 *
 * The realtime switch lives at /api/provider/state; it is not touched here,
 * because conflating "I'm accepting jobs right now" with "I work Sundays"
 * is exactly how availability becomes unpredictable.
 */

const windowSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'שעה לא תקינה'),
  endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'שעה לא תקינה'),
});

const putSchema = z.object({
  /** The full weekly plan. Replaces what is there — no partial merging. */
  windows: z.array(windowSchema).max(60),
});

const overrideSchema = z.object({
  onDate: z.iso.date(),
  /**
   * A vacation is the same thing as "not available" repeated over a range, so
   * it is not a third concept — it is one override per day. That keeps the
   * precedence rules unchanged and means a single day can still be reclaimed
   * without unpicking a range.
   */
  untilDate: z.iso.date().optional(),
  kind: z.enum(['unavailable', 'window']),
  startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  note: z.string().trim().max(200).optional(),
});

/** Inclusive list of ISO dates from..to, capped so one request cannot write forever. */
function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end && dates.length < 120) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export async function GET() {
  const requestId = newRequestId();
  try {
    const user = await requireRole('provider');

    const data = await withUser(user.id, async (db) => {
      const windows = await db.many<{
        id: string; weekday: number; starts_at: string; ends_at: string;
      }>(
        `select id, weekday, starts_at::text as starts_at, ends_at::text as ends_at
           from provider_availability_rules
          where provider_id = $1 and is_active
          order by weekday, starts_at`,
        [user.id],
      );

      const overrides = await db.many<{
        id: string; on_date: string; kind: string;
        starts_at: string | null; ends_at: string | null; note: string | null;
      }>(
        `select id, on_date::text as on_date, kind,
                starts_at::text as starts_at, ends_at::text as ends_at, note
           from provider_availability_overrides
          where provider_id = $1 and on_date >= current_date
          order by on_date
          limit 60`,
        [user.id],
      );

      const state = await db.one<{ state: string; verification: string }>(
        `select state::text as state, verification::text as verification
           from provider_profiles where id = $1`,
        [user.id],
      );

      return { windows, overrides, state };
    });

    // The one line the provider home screen shows, from the same helper the
    // customer-facing profile uses — so the provider can never be told
    // something different from what a customer is told about them.
    const summary = await availabilitySummary(user.id);

    return ok({
      ...data,
      dayNames: HEBREW_DAYS,
      summary,
      phrase: availabilityPhrase(summary, new Date()),
    });
  } catch (error) {
    return handleError(error, 'provider.availability.get', requestId);
  }
}

/** Replace the weekly plan. */
export async function PUT(request: Request) {
  const requestId = newRequestId();
  try {
    const user = await requireRole('provider');
    const body = await parseJson(request, putSchema);

    for (const w of body.windows) {
      if (w.endsAt <= w.startsAt) {
        throw new ApiError(
          'INVALID_WINDOW',
          `ביום ${HEBREW_DAYS[w.weekday]}: שעת הסיום חייבת להיות אחרי שעת ההתחלה`,
          422,
          { weekday: w.weekday },
        );
      }
    }

    // Overlapping windows on the same day are merged rather than rejected:
    // the provider meant "I'm available across this span", and refusing the
    // input would be pedantry about a detail they cannot see.
    const byDay = new Map<number, { startsAt: string; endsAt: string }[]>();
    for (const w of body.windows) {
      const list = byDay.get(w.weekday) ?? [];
      list.push({ startsAt: w.startsAt, endsAt: w.endsAt });
      byDay.set(w.weekday, list);
    }
    const merged: { weekday: number; startsAt: string; endsAt: string }[] = [];
    for (const [weekday, list] of byDay) {
      const sorted = [...list].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      let current = sorted[0];
      if (!current) continue;
      for (const next of sorted.slice(1)) {
        if (next.startsAt <= current.endsAt) {
          current = {
            startsAt: current.startsAt,
            endsAt: next.endsAt > current.endsAt ? next.endsAt : current.endsAt,
          };
        } else {
          merged.push({ weekday, ...current });
          current = next;
        }
      }
      merged.push({ weekday, ...current });
    }

    await withUser(user.id, async (db) => {
      await db.query('delete from provider_availability_rules where provider_id = $1', [user.id]);
      for (const w of merged) {
        await db.query(
          `insert into provider_availability_rules (provider_id, weekday, starts_at, ends_at)
           values ($1,$2,$3::time,$4::time)`,
          [user.id, w.weekday, w.startsAt, w.endsAt],
        );
      }
    });

    logOperation({
      requestId, userId: user.id, providerId: user.id,
      operation: 'provider.availability.put', result: 'ok',
      meta: { windows: merged.length, submitted: body.windows.length },
    });

    return ok({ windows: merged.length, days: byDay.size });
  } catch (error) {
    return handleError(error, 'provider.availability.put', requestId);
  }
}

/** Add or replace a single date override. */
export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const user = await requireRole('provider');
    const body = await parseJson(request, overrideSchema);

    if (body.kind === 'window' && (!body.startsAt || !body.endsAt)) {
      throw new ApiError('INVALID_WINDOW', 'יש לציין שעת התחלה וסיום', 422);
    }
    if (body.kind === 'window' && body.endsAt! <= body.startsAt!) {
      throw new ApiError('INVALID_WINDOW', 'שעת הסיום חייבת להיות אחרי ההתחלה', 422);
    }
    if (body.untilDate && body.untilDate < body.onDate) {
      throw new ApiError('INVALID_RANGE', 'תאריך הסיום חייב להיות אחרי תאריך ההתחלה', 422);
    }
    if (body.untilDate && body.kind === 'window') {
      // A repeated daily window across a range is the weekly plan's job, and
      // offering both would give two answers to the same question.
      throw new ApiError(
        'RANGE_UNSUPPORTED',
        'טווח תאריכים אפשרי רק לחסימה. לשעות קבועות יש להשתמש בתוכנית השבועית.',
        422,
      );
    }

    const dates = body.untilDate ? dateRange(body.onDate, body.untilDate) : [body.onDate];

    await withUser(user.id, async (db) => {
      for (const onDate of dates) {
        await db.query(
          `insert into provider_availability_overrides
             (provider_id, on_date, kind, starts_at, ends_at, note)
           values ($1,$2::date,$3,$4::time,$5::time,$6)
           on conflict (provider_id, on_date) do update
             set kind = excluded.kind, starts_at = excluded.starts_at,
                 ends_at = excluded.ends_at, note = excluded.note`,
          [
            user.id, onDate, body.kind,
            body.kind === 'window' ? (body.startsAt ?? null) : null,
            body.kind === 'window' ? (body.endsAt ?? null) : null,
            body.note ?? null,
          ],
        );
      }
    });

    logOperation({
      requestId, userId: user.id, providerId: user.id,
      operation: 'provider.availability.override', result: 'ok',
      meta: { onDate: body.onDate, untilDate: body.untilDate ?? body.onDate,
              kind: body.kind, days: dates.length },
    });

    return ok({ onDate: body.onDate, kind: body.kind, days: dates.length });
  } catch (error) {
    return handleError(error, 'provider.availability.override', requestId);
  }
}

/** Remove a date override, returning that date to the weekly plan. */
export async function DELETE(request: Request) {
  const requestId = newRequestId();
  try {
    const user = await requireRole('provider');
    const onDate = new URL(request.url).searchParams.get('onDate');
    if (!onDate || !/^\d{4}-\d{2}-\d{2}$/.test(onDate)) {
      throw new ApiError('INVALID_DATE', 'תאריך לא תקין', 422);
    }

    await withUser(user.id, (db) =>
      db.query(
        'delete from provider_availability_overrides where provider_id = $1 and on_date = $2::date',
        [user.id, onDate],
      ),
    );

    return ok({ onDate, removed: true });
  } catch (error) {
    return handleError(error, 'provider.availability.delete', requestId);
  }
}
