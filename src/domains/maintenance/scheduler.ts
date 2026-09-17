import { runMaintenanceTick } from './tick';
import { logOperation } from '@/lib/logger';

/**
 * The clock the platform runs on.
 *
 * Everything time-based in this product — an offer's window closing, a job
 * escalating to a wider radius, a declared shift ending, a licence expiring —
 * happens because something calls the maintenance tick. Nothing did. The
 * endpoint existed and its own comment said "safe to call from a cron, a
 * scheduler, or the demo console", and there was no cron, no scheduler and
 * nobody pressing the button.
 *
 * The failure mode is the quiet kind: the app serves pages, jobs get
 * dispatched, and then offers never expire, so a job sits in
 * OFFERS_AVAILABLE for ever, never widens its radius and never gives up. A
 * customer watches a spinner that will not resolve. Nothing logs an error,
 * because nothing went wrong — nothing happened at all.
 *
 * So the server schedules it itself, rather than depending on a piece of
 * infrastructure somebody has to remember to configure. `MAINTENANCE_URL`-
 * style external cron still works and is still the better answer at scale;
 * this makes the default deployment correct instead of quietly broken.
 */

/** Default cadence. Offers expire in tens of seconds, so this has to be brisk. */
const DEFAULT_INTERVAL_SECONDS = 30;

let timer: NodeJS.Timeout | null = null;
/** Guards against a second start in the same process, e.g. after an HMR reload. */
let running = false;
/**
 * A tick in flight.
 *
 * Overlap is the one thing to avoid. The tick is idempotent, so two of them
 * are safe, but a slow tick followed by another every 30 seconds is how a
 * database gets a queue of identical work; skipping is always right because
 * the next run does whatever this one would have.
 */
let inFlight = false;

export function maintenanceIntervalSeconds(): number {
  const raw = process.env.MAINTENANCE_INTERVAL_SECONDS;
  if (raw === undefined) return DEFAULT_INTERVAL_SECONDS;
  const parsed = Number(raw);
  // Anything unparseable falls back rather than silently disabling the clock.
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_INTERVAL_SECONDS;
  // 0 is a deliberate "an external cron owns this".
  if (parsed === 0) return 0;
  return Math.max(5, Math.min(3600, parsed));
}

export function startMaintenanceScheduler(): void {
  if (running) return;

  const seconds = maintenanceIntervalSeconds();
  if (seconds === 0) {
    logOperation({
      operation: 'maintenance.scheduler',
      result: 'ok',
      meta: { started: 'false', reason: 'MAINTENANCE_INTERVAL_SECONDS=0' },
    });
    return;
  }

  running = true;

  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const result = await runMaintenanceTick();
      // Logged only when it did something, so an idle platform does not write
      // a line every thirty seconds and bury everything that matters.
      const did =
        result.expiredOffers + result.shiftsEnded + result.escalated.length +
        result.lapsedProviders + result.expiryWarnings + result.purgedDocumentFiles;
      if (did > 0 || result.failures.length > 0) {
        logOperation({
          operation: 'maintenance.tick',
          result: result.failures.length > 0 ? 'error' : 'ok',
          meta: {
            source: 'scheduler',
            expiredOffers: result.expiredOffers,
            shiftsEnded: result.shiftsEnded,
            escalated: result.escalated.length,
            lapsedProviders: result.lapsedProviders,
            expiryWarnings: result.expiryWarnings,
            purgedDocumentFiles: result.purgedDocumentFiles,
            failures: result.failures.join(',') || null,
          },
        });
      }
    } catch (error) {
      // A throw here would take the interval down with it and stop the clock
      // silently — the exact failure this module exists to prevent.
      logOperation({
        operation: 'maintenance.tick',
        result: 'error',
        meta: {
          source: 'scheduler',
          message: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
        },
      });
    } finally {
      inFlight = false;
    }
  };

  timer = setInterval(() => void tick(), seconds * 1000);
  // Never hold the process open on its own account.
  timer.unref?.();

  logOperation({
    operation: 'maintenance.scheduler',
    result: 'ok',
    meta: { started: 'true', intervalSeconds: seconds },
  });

  // The first tick soon after boot rather than a full interval later, so a
  // restart does not leave a backlog sitting for half a minute.
  setTimeout(() => void tick(), 2_000).unref?.();
}

/** Test seam, and a clean shutdown. */
export function stopMaintenanceScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
  running = false;
}
