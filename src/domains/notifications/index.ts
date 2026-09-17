import { LoggingNotifier } from './logging-notifier';
import type { Notifier } from './notifier';

export * from './notifier';
export { LoggingNotifier, redactDestination } from './logging-notifier';
export * from './outbox';

let cached: Notifier | null = null;

/**
 * Resolve the configured notifier.
 *
 * Only the logging stand-in exists today and it reports `isReal = false`.
 * When a real gateway is added it registers here; nothing else changes.
 */
export function getNotifier(): Notifier {
  if (cached) return cached;
  cached = new LoggingNotifier();
  return cached;
}

/** Test seam. */
export function setNotifier(notifier: Notifier | null): void {
  cached = notifier;
}

/**
 * Refuse to run a production platform on an adapter that reaches nobody.
 *
 * The same guard as `assertPaymentProviderIsSafe`, and for a stronger reason
 * than it looks: unlike a payment, a notification that silently fails leaves
 * no complaint. Customers wait, providers never answer, and the dashboard
 * shows a marketplace with no liquidity rather than a marketplace with no
 * notifications. Called at startup, not per send, so the failure is loud and
 * immediate.
 */
export function assertNotifierIsSafe(): void {
  const notifier = getNotifier();
  if (!notifier.isReal && process.env.NODE_ENV === 'production' && process.env.DEMO_MODE !== 'true') {
    throw new Error(
      `Refusing to run in production with the "${notifier.name}" notifier, which does not ` +
        'reach anybody. Configure a real Notifier, or set DEMO_MODE=true to acknowledge ' +
        'that notifications are not delivered.',
    );
  }
}
