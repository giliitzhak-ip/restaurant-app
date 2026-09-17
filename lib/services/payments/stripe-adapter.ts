import type {
  AuthorizeInput,
  CaptureInput,
  PaymentAdapter,
  PaymentResult,
  RefundInput,
} from './types';

const API_BASE = 'https://api.stripe.com/v1';

/**
 * Stripe adapter built on manual-capture PaymentIntents, which is exactly the
 * flow GET SERVICE needs: authorise when the customer picks a provider, capture
 * when the job is completed.
 *
 * It talks to the REST API directly rather than pulling in the SDK, so the
 * dependency surface stays small; swap in `stripe` if you need webhooks with
 * full signature verification and richer types.
 */
export class StripePaymentAdapter implements PaymentAdapter {
  readonly name = 'stripe' as const;

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string | null = null,
  ) {}

  get isLive() {
    return Boolean(this.secretKey);
  }

  private async post(path: string, body: Record<string, string>, idempotencyKey?: string) {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: new URLSearchParams(body).toString(),
    });
    const json = (await response.json()) as Record<string, unknown>;
    return { ok: response.ok, json };
  }

  private static failure(json: Record<string, unknown>): PaymentResult {
    const error = json.error as { message?: string } | undefined;
    return {
      ok: false,
      externalId: null,
      status: 'failed',
      error: error?.message ?? 'התשלום נכשל',
      raw: json,
    };
  }

  async authorize(input: AuthorizeInput): Promise<PaymentResult> {
    const { ok, json } = await this.post(
      '/payment_intents',
      {
        amount: String(Math.round(input.amount * 100)),
        currency: input.currency.toLowerCase(),
        capture_method: 'manual',
        description: input.description,
        'metadata[job_id]': input.jobId,
        'metadata[payment_id]': input.paymentId,
        ...(input.customerEmail ? { receipt_email: input.customerEmail } : {}),
      },
      input.paymentId,
    );

    if (!ok) return StripePaymentAdapter.failure(json);

    return {
      ok: true,
      externalId: String(json.id),
      status: json.status === 'requires_capture' ? 'authorized' : 'pending',
      redirectUrl: (json.next_action as { redirect_to_url?: { url?: string } } | null)
        ?.redirect_to_url?.url,
      raw: json,
    };
  }

  async capture(input: CaptureInput): Promise<PaymentResult> {
    if (!input.externalId) {
      return { ok: false, externalId: null, status: 'failed', error: 'חסר מזהה תשלום' };
    }
    const { ok, json } = await this.post(
      `/payment_intents/${input.externalId}/capture`,
      { amount_to_capture: String(Math.round(input.amount * 100)) },
      `capture_${input.paymentId}`,
    );
    if (!ok) return StripePaymentAdapter.failure(json);
    return { ok: true, externalId: String(json.id), status: 'captured', raw: json };
  }

  async refund(input: RefundInput): Promise<PaymentResult> {
    if (!input.externalId) {
      return { ok: false, externalId: null, status: 'failed', error: 'חסר מזהה תשלום' };
    }
    const { ok, json } = await this.post(
      '/refunds',
      {
        payment_intent: input.externalId,
        amount: String(Math.round(input.amount * 100)),
        ...(input.reason ? { 'metadata[reason]': input.reason } : {}),
      },
      `refund_${input.paymentId}`,
    );
    if (!ok) return StripePaymentAdapter.failure(json);
    return { ok: true, externalId: input.externalId, status: 'refunded', raw: json };
  }

  async parseWebhook(rawBody: string, signature: string | null) {
    // Signature verification requires the webhook secret; without it we refuse
    // the event rather than trusting an unsigned payload.
    if (!this.webhookSecret || !signature) return null;

    const { createHmac, timingSafeEqual } = await import('node:crypto');
    const parts = Object.fromEntries(
      signature.split(',').map((part) => part.split('=') as [string, string]),
    );
    const timestamp = parts.t;
    const provided = parts.v1;
    if (!timestamp || !provided) return null;

    const expected = createHmac('sha256', this.webhookSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const event = JSON.parse(rawBody) as {
      type: string;
      data: { object: { id: string; metadata?: Record<string, string> } };
    };
    return {
      type: event.type,
      paymentId: event.data.object.metadata?.payment_id ?? null,
      externalId: event.data.object.id,
    };
  }
}
