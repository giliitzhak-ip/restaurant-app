import { handleError, ok } from '@/lib/api';
import { expireAndEscalate } from '@/domains/matching/dispatch';
import { logOperation, newRequestId } from '@/lib/logger';

/**
 * Maintenance tick (spec §16, §44).
 *
 * Expires offers whose window closed and escalates any job still waiting to
 * its next dispatch wave. Idempotent, so it is safe to call from a cron, a
 * scheduler, or the demo console.
 *
 * Protected by a shared secret rather than a user session, because it acts as
 * the system. Without MAINTENANCE_TOKEN set it is only callable in
 * development.
 */
export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const token = process.env.MAINTENANCE_TOKEN;
    const presented = request.headers.get('x-maintenance-token');

    if (token) {
      if (presented !== token) {
        return Response.json(
          { error: { code: 'FORBIDDEN', message: 'Invalid maintenance token' }, requestId },
          { status: 403 },
        ) as never;
      }
    } else if (process.env.NODE_ENV === 'production') {
      return Response.json(
        {
          error: {
            code: 'NOT_CONFIGURED',
            message: 'MAINTENANCE_TOKEN must be set in production',
          },
          requestId,
        },
        { status: 503 },
      ) as never;
    }

    const result = await expireAndEscalate();
    logOperation({
      requestId, operation: 'maintenance.tick', result: 'ok',
      meta: { expiredOffers: result.expiredOffers, escalated: result.escalated.length },
    });
    return ok(result);
  } catch (error) {
    return handleError(error, 'maintenance.tick', requestId);
  }
}
