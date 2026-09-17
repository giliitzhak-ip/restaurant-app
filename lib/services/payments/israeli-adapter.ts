import type {
  AuthorizeInput,
  CaptureInput,
  PaymentAdapter,
  PaymentResult,
  RefundInput,
} from './types';

/**
 * Israeli acquirer adapter (Tranzila / Cardcom / PayPlus style).
 *
 * Those gateways share a shape: a hosted payment page for the J5 (authorisation
 * hold), then a server-to-server J4 (capture) once the work is done. The
 * endpoint and field names differ per acquirer, so this class takes them as
 * configuration instead of hard-coding one vendor.
 *
 * Wire an acquirer by setting PAYMENT_PROVIDER=israeli plus PAYMENT_SECRET_KEY
 * and the endpoint below. Until an endpoint is configured `isLive` is false and
 * the factory falls back to the mock adapter, so nothing silently half-works.
 */
export class IsraeliPaymentAdapter implements PaymentAdapter {
  readonly name = 'israeli' as const;

  constructor(
    private readonly config: {
      apiKey: string;
      terminalId?: string;
      /** Base URL of the acquirer's REST API. */
      endpoint?: string;
    },
  ) {}

  get isLive() {
    return Boolean(this.config.apiKey && this.config.endpoint);
  }

  private notConfigured(): PaymentResult {
    return {
      ok: false,
      externalId: null,
      status: 'failed',
      error: 'ספק הסליקה הישראלי לא הוגדר. הגדר PAYMENT_SECRET_KEY ונקודת קצה.',
    };
  }

  private async call(path: string, payload: Record<string, unknown>) {
    const response = await fetch(`${this.config.endpoint}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({ terminal: this.config.terminalId, ...payload }),
    });
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: response.ok, json };
  }

  async authorize(input: AuthorizeInput): Promise<PaymentResult> {
    if (!this.isLive) return this.notConfigured();

    // J5 — hold the funds without charging.
    const { ok, json } = await this.call('/transactions/authorize', {
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      reference: input.paymentId,
      success_url: input.returnUrl,
      metadata: { job_id: input.jobId, ...input.metadata },
    });

    if (!ok) {
      return {
        ok: false,
        externalId: null,
        status: 'failed',
        error: String(json.message ?? 'הסליקה נכשלה'),
        raw: json,
      };
    }

    return {
      ok: true,
      externalId: json.transaction_id ? String(json.transaction_id) : null,
      status: json.payment_url ? 'pending' : 'authorized',
      redirectUrl: json.payment_url ? String(json.payment_url) : undefined,
      raw: json,
    };
  }

  async capture(input: CaptureInput): Promise<PaymentResult> {
    if (!this.isLive) return this.notConfigured();

    // J4 — capture the held amount.
    const { ok, json } = await this.call('/transactions/capture', {
      transaction_id: input.externalId,
      amount: input.amount,
      reference: input.paymentId,
    });
    if (!ok) {
      return {
        ok: false,
        externalId: input.externalId,
        status: 'failed',
        error: String(json.message ?? 'הגבייה נכשלה'),
        raw: json,
      };
    }
    return { ok: true, externalId: input.externalId, status: 'captured', raw: json };
  }

  async refund(input: RefundInput): Promise<PaymentResult> {
    if (!this.isLive) return this.notConfigured();
    const { ok, json } = await this.call('/transactions/refund', {
      transaction_id: input.externalId,
      amount: input.amount,
      reason: input.reason,
    });
    if (!ok) {
      return {
        ok: false,
        externalId: input.externalId,
        status: 'failed',
        error: String(json.message ?? 'הזיכוי נכשל'),
        raw: json,
      };
    }
    return { ok: true, externalId: input.externalId, status: 'refunded', raw: json };
  }

  async parseWebhook(rawBody: string, signature: string | null) {
    if (!signature) return null;
    try {
      const event = JSON.parse(rawBody) as {
        event?: string;
        reference?: string;
        transaction_id?: string;
      };
      return {
        type: event.event ?? 'unknown',
        paymentId: event.reference ?? null,
        externalId: event.transaction_id ?? null,
      };
    } catch {
      return null;
    }
  }
}
