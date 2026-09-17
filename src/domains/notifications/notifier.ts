/**
 * Notifier abstraction (spec §29).
 *
 * `notifications` rows have been written since the schema was built, and they
 * reach an open browser over SSE. For this product that is close to worthless
 * on its own: the premise is that a provider hears about a job within
 * seconds, and a provider with the tab closed — which is every provider, most
 * of the time — hears nothing. An offer expires in two minutes and nobody
 * ever knew it existed.
 *
 * So there is an adapter, and it is honest about being a stand-in. Same shape
 * and the same guard as PaymentProvider: `isReal` is false, production refuses
 * to run on it, and when a real push or SMS gateway arrives it registers here
 * and nothing else changes.
 */

export type DeliveryChannel = 'push' | 'sms' | 'email';

export interface DeliveryRequest {
  readonly channel: DeliveryChannel;
  /** Phone number, email address or device token, as recorded at send time. */
  readonly destination: string;
  readonly title: string;
  readonly body: string;
  readonly payload?: Record<string, unknown>;
  /** The notification row this belongs to, for correlation in logs. */
  readonly notificationId: string;
}

export interface DeliveryResult {
  readonly ok: boolean;
  /** The gateway's own id, when there is one. */
  readonly externalRef?: string | null;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  /** False when retrying could never help: a malformed number, a hard bounce. */
  readonly retryable?: boolean;
}

export interface Notifier {
  readonly name: string;
  /** False means this adapter does not actually reach anybody. */
  readonly isReal: boolean;
  readonly channels: readonly DeliveryChannel[];
  send(request: DeliveryRequest): Promise<DeliveryResult>;
}
