import { logOperation } from '@/lib/logger';
import type { DeliveryRequest, DeliveryResult, Notifier } from './notifier';

/**
 * The stand-in adapter: it writes what it would have sent and reports that it
 * is not real.
 *
 * Deliberately not called "mock" in its user-visible reporting and
 * deliberately not silent. The dangerous version of this class is the one
 * that returns `{ ok: true }` and does nothing, because then every screen,
 * every metric and every test says the message was delivered. This one
 * succeeds — the outbox row must not retry for ever against an adapter that
 * cannot work — and says in the log, and through `isReal`, that nothing left
 * the building.
 */
export class LoggingNotifier implements Notifier {
  readonly name = 'logging';
  readonly isReal = false;
  readonly channels = ['push', 'sms', 'email'] as const;

  async send(request: DeliveryRequest): Promise<DeliveryResult> {
    logOperation({
      operation: 'notify.send',
      result: 'ok',
      meta: {
        adapter: this.name,
        delivered: 'false',
        channel: request.channel,
        notificationId: request.notificationId,
        // The destination is a phone number or an email address. Logged as a
        // shape rather than a value: an operator needs to know a message was
        // aimed somewhere plausible, not who it was for.
        destination: redactDestination(request.destination),
        title: request.title.slice(0, 80),
      },
    });

    return { ok: true, externalRef: null };
  }
}

/** `+9725********` / `a***@example.com` — enough to debug, not enough to leak. */
export function redactDestination(destination: string): string {
  if (destination.includes('@')) {
    const [local, domain] = destination.split('@');
    return `${(local ?? '').slice(0, 1)}***@${domain ?? ''}`;
  }
  if (destination.length <= 5) return '*'.repeat(destination.length);
  return `${destination.slice(0, 5)}${'*'.repeat(destination.length - 5)}`;
}
