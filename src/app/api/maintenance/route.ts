import { handleError, ok } from '@/lib/api';
import { runMaintenanceTick } from '@/domains/maintenance/tick';
import { maintenanceIntervalSeconds } from '@/domains/maintenance/scheduler';
import { logOperation, newRequestId } from '@/lib/logger';

/**
 * Maintenance tick (spec §16, §44).
 *
 * Expires offers whose window closed, ends realtime shifts that have run past
 * their declared end, escalates any job still waiting to its next dispatch
 * wave, and looks after the document lifecycle. Idempotent, so it is safe to
 * call from a cron, a scheduler, or the demo console.
 *
 * The server also schedules this itself (see
 * @/domains/maintenance/scheduler), because for a long time this endpoint's
 * comment said "safe to call from a cron" and there was no cron: offers never
 * expired and jobs never escalated. This handler stays so an external
 * scheduler can own the clock instead — set MAINTENANCE_INTERVAL_SECONDS=0
 * and call this.
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

    const result = await runMaintenanceTick();
    logOperation({
      requestId, operation: 'maintenance.tick',
      result: result.failures.length > 0 ? 'error' : 'ok',
      meta: {
        source: 'http',
        expiredOffers: result.expiredOffers,
        shiftsEnded: result.shiftsEnded,
        escalated: result.escalated.length,
        lapsedProviders: result.lapsedProviders,
        expiryWarnings: result.expiryWarnings,
        purgedDocumentFiles: result.purgedDocumentFiles,
        purgedRateLimits: result.purgedRateLimits,
        deliveriesSent: result.deliveriesSent,
        deliveriesAbandoned: result.deliveriesAbandoned,
        failures: result.failures.join(',') || null,
      },
    });
    // Says whether the process is also ticking itself, so an operator
    // configuring a cron can tell whether they are about to double up.
    return ok({ ...result, selfScheduledEverySeconds: maintenanceIntervalSeconds() });
  } catch (error) {
    return handleError(error, 'maintenance.tick', requestId);
  }
}
