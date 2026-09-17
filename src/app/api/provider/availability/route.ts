import { z } from 'zod';
import { ApiError, handleError, ok, parseJson } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { withSystem, withUser } from '@/lib/db';
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
  kind: z.enum(['unavailable', 'window']),
  startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  note: z.string().trim().max(200).optional(),
});

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

    // The one line the provider home screen shows. Computed server-side
    // because it depends on overrides, conflicts and the clock.
    const summary = await withSystem((db) =>
      db.one<{ next_at: Date | null; open_until: string | null }>(
        `select
           provider_next_available_at($1) as next_at,
           (
             -- If they are available right now, when does the current window end?
             select to_char(
                      coalesce(
                        (select o.ends_at from provider_availability_overrides o
                          where o.provider_id = $1
                            and o.on_date = (now() at time zone availability_timezone())::date
                            and o.kind = 'window'),
                        (select max(r.ends_at) from provider_availability_rules r
                          where r.provider_id = $1 and r.is_active
                            and r.weekday = extract(dow from now() at time zone availability_timezone())::smallint
                            and (now() at time zone availability_timezone())::time between r.starts_at and r.ends_at)
                      ), 'HH24:MI')
           ) as open_until`,
        [user.id],
      ),
    );

    return ok({
      ...data,
      dayNames: HEBREW_DAYS,
      nextAvailableAt: summary?.next_at ?? null,
      openUntil: summary?.open_until ?? null,
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

    await withUser(user.id, (db) =>
      db.query(
        `insert into provider_availability_overrides
           (provider_id, on_date, kind, starts_at, ends_at, note)
         values ($1,$2::date,$3,$4::time,$5::time,$6)
         on conflict (provider_id, on_date) do update
           set kind = excluded.kind, starts_at = excluded.starts_at,
               ends_at = excluded.ends_at, note = excluded.note`,
        [
          user.id, body.onDate, body.kind,
          body.kind === 'window' ? (body.startsAt ?? null) : null,
          body.kind === 'window' ? (body.endsAt ?? null) : null,
          body.note ?? null,
        ],
      ),
    );

    logOperation({
      requestId, userId: user.id, providerId: user.id,
      operation: 'provider.availability.override', result: 'ok',
      meta: { onDate: body.onDate, kind: body.kind },
    });

    return ok({ onDate: body.onDate, kind: body.kind });
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
