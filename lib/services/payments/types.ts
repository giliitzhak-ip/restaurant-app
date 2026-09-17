export type PaymentProviderName = 'mock' | 'stripe' | 'israeli';

export interface AuthorizeInput {
  /** Our payment row id — used as the idempotency key. */
  paymentId: string;
  jobId: string;
  amount: number;
  currency: string;
  customerEmail?: string | null;
  customerName?: string | null;
  description: string;
  /** Where the provider should send the customer back to, if it redirects. */
  returnUrl?: string;
  metadata?: Record<string, string>;
}

export interface PaymentResult {
  ok: boolean;
  /** The provider's own identifier for the authorisation/charge. */
  externalId: string | null;
  status: 'authorized' | 'captured' | 'refunded' | 'failed' | 'pending';
  /** Present when the provider needs the customer to complete a hosted step. */
  redirectUrl?: string;
  /** Present when `ok` is false. Safe to show to a user. */
  error?: string;
  raw?: Record<string, unknown>;
}

export interface CaptureInput {
  paymentId: string;
  externalId: string | null;
  /** Final amount; may be lower than the authorised amount, never higher. */
  amount: number;
  currency: string;
}

export interface RefundInput {
  paymentId: string;
  externalId: string | null;
  amount: number;
  currency: string;
  reason?: string;
}

/**
 * Every payment provider implements this. The application only ever talks to
 * this interface, so swapping Stripe for an Israeli acquirer is a new adapter
 * and a config change — no flow or schema change.
 */
export interface PaymentAdapter {
  readonly name: PaymentProviderName;
  /** False when the adapter lacks credentials; the app then shows mock notices. */
  readonly isLive: boolean;

  authorize(input: AuthorizeInput): Promise<PaymentResult>;
  capture(input: CaptureInput): Promise<PaymentResult>;
  refund(input: RefundInput): Promise<PaymentResult>;
  /** Verifies a webhook signature and returns the parsed event, or null. */
  parseWebhook(rawBody: string, signature: string | null): Promise<{ type: string; paymentId: string | null; externalId: string | null } | null>;
}
