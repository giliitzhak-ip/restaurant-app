import { z } from 'zod';
import { ApiError, handleError, ok, parseJson } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { withSystem, withUser } from '@/lib/db';
import { loadLocationIntervals } from '@/lib/settings';
import { logOperation, newRequestId } from '@/lib/logger';

const bodySchema = z.object({ state: z.enum(['OFFLINE', 'ONLINE']) });

/**
 * Provider availability (spec §17).
 *
 * A provider may set themselves ONLINE or OFFLINE. BUSY is not settable by
 * hand: it is a consequence of holding an assignment, so it cannot be used to
 * dodge the "one job at a time" rule.
 *
 * Going OFFLINE clears the stored location: when there is no tracking there
 * should be no last known position pretending to be live (spec §18).
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

    await withUser(user.id, async (db) => {
      await db.query(
        `update provider_profiles set state = $2::provider_state, state_changed_at = now()
          where id = $1`,
        [user.id, body.state],
      );
      if (body.state === 'OFFLINE') {
        await db.query('delete from provider_locations where provider_id = $1', [user.id]);
      }
    });

    await withSystem(async (db) => {
      await db.query(
        `update provider_availability set ended_at = now()
          where provider_id = $1 and ended_at is null`,
        [user.id],
      );
      await db.query(
        `insert into provider_availability (provider_id, state) values ($1, $2::provider_state)`,
        [user.id, body.state],
      );
    });

    const intervals = await loadLocationIntervals();

    logOperation({
      requestId, userId: user.id, providerId: user.id,
      operation: 'provider.state', result: 'ok',
      meta: { from: profile.state, to: body.state },
    });

    return ok({
      state: body.state,
      // Tells the client how often to report position for this state.
      locationIntervalSeconds: intervals[body.state],
    });
  } catch (error) {
    return handleError(error, 'provider.state', requestId);
  }
}
