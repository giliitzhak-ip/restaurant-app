import { z } from 'zod';
import { ApiError, handleError, ok, parseJson } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { withSystem, withUser } from '@/lib/db';
import { loadLocationIntervals } from '@/lib/settings';
import { logOperation, newRequestId } from '@/lib/logger';

const bodySchema = z
  .object({
    state: z.enum(['OFFLINE', 'ONLINE']),
    /**
     * Optional end to the shift. A provider who taps "accepting jobs" almost
     * never means "until I remember to turn this off" — they mean for the
     * next couple of hours, or until they knock off. Both forms land in
     * provider_profiles.online_until, which matching enforces directly.
     */
    forMinutes: z.number().int().min(15).max(720).optional(),
    untilLocalTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'שעה לא תקינה')
      .optional(),
  })
  .refine((body) => !(body.forMinutes && body.untilLocalTime), {
    message: 'יש לבחור משך או שעת סיום, לא שניהם',
  });

/**
 * The realtime switch (spec §17, §9).
 *
 * ONLINE / OFFLINE is the provider's answer to "am I accepting work right
 * now?". BUSY is not settable by hand: it is a consequence of holding an
 * assignment, so it cannot be used to dodge the one-job-at-a-time rule.
 *
 * This endpoint does NOT touch the weekly plan. The two are separate on
 * purpose — see /api/provider/availability.
 *
 * Going OFFLINE clears the stored location: with no tracking there must be no
 * last known position pretending to be live (spec §18).
 */
export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const user = await requireRole('provider');
    const body = await parseJson(request, bodySchema);

    const profile = await withUser(user.id, (db) =>
      db.one<{ state: string; verification: string }>(
        `select state::text as state, verification::text as verification
           from provider_profiles where id = $1`,
        [user.id],
      ),
    );

    if (!profile) throw new ApiError('NOT_FOUND', 'הפרופיל לא נמצא', 404);

    if (profile.verification !== 'VERIFIED' && body.state === 'ONLINE') {
      throw new ApiError(
        'NOT_VERIFIED',
        'החשבון ממתין לאימות. לא ניתן לקבל עבודות עד לאישור.',
        403,
        { verification: profile.verification },
      );
    }

    if (profile.state === 'BUSY') {
      throw new ApiError(
        'PROVIDER_BUSY',
        'יש לך עבודה פעילה. יש לסיים אותה לפני שינוי מצב.',
        409,
      );
    }

    /* ── Resolve the end of the shift ──────────────────────────────────────
       "Until 18:00" is a WALL-CLOCK time in the platform timezone, resolved
       in the database rather than from the browser's clock, so a provider
       travelling with a device on another timezone still means local 18:00. */
    let onlineUntil: Date | null = null;
    if (body.state === 'ONLINE' && (body.forMinutes || body.untilLocalTime)) {
      const resolved = await withSystem((db) =>
        db.one<{ until_at: Date | null }>(
          body.forMinutes
            ? `select now() + make_interval(mins => $1::int) as until_at`
            : `select (
                 ((now() at time zone availability_timezone())::date + $1::time)
                   at time zone availability_timezone()
               ) as until_at`,
          [body.forMinutes ?? body.untilLocalTime ?? null],
        ),
      );
      onlineUntil = resolved?.until_at ?? null;

      // A time that has already passed today is a mistake, not an instruction
      // to stay offline — say so instead of silently accepting it.
      if (onlineUntil && onlineUntil.getTime() <= Date.now()) {
        throw new ApiError(
          'TIME_IN_PAST',
          'השעה שבחרת כבר עברה. בחר שעה מאוחרת יותר.',
          422,
        );
      }
    }

    await withUser(user.id, async (db) => {
      await db.query(
        `update provider_profiles
            set state = $2::provider_state,
                state_changed_at = now(),
                -- Cleared on every change: an old expiry must not survive a
                -- plain "accepting jobs" tap and silently switch them off.
                online_until = $3
          where id = $1`,
        [user.id, body.state, onlineUntil],
      );
      if (body.state === 'OFFLINE') {
        await db.query('delete from provider_locations where provider_id = $1', [user.id]);
      }
    });

    // Logged to provider_status_history. Note the name: this is the history of
    // the realtime switch, a different thing from the weekly plan held in
    // provider_availability_rules.
    await withSystem(async (db) => {
      await db.query(
        `update provider_status_history set ended_at = now()
          where provider_id = $1 and ended_at is null`,
        [user.id],
      );
      await db.query(
        `insert into provider_status_history (provider_id, state)
         values ($1, $2::provider_state)`,
        [user.id, body.state],
      );
    });

    const intervals = await loadLocationIntervals();

    logOperation({
      requestId, userId: user.id, providerId: user.id,
      operation: 'provider.state', result: 'ok',
      meta: {
        from: profile.state,
        to: body.state,
        onlineUntil: onlineUntil ? onlineUntil.toISOString() : 'open',
      },
    });

    return ok({
      state: body.state,
      onlineUntil: onlineUntil ? onlineUntil.toISOString() : null,
      // Tells the client how often to report position for this state.
      locationIntervalSeconds: intervals[body.state],
    });
  } catch (error) {
    return handleError(error, 'provider.state', requestId);
  }
}
