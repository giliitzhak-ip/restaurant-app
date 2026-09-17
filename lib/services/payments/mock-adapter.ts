import type {
  AuthorizeInput,
  CaptureInput,
  PaymentAdapter,
  PaymentResult,
  RefundInput,
} from './types';

/**
 * Development adapter. It performs the full state machine — authorize, capture,
 * refund — against in-memory state so the whole payment flow is exercisable
 * without credentials. It never contacts a network and never moves money.
 */
export class MockPaymentAdapter implements PaymentAdapter {
  readonly name = 'mock' as const;
  readonly isLive = false;

  private authorizations = new Map<string, { amount: number; captured: boolean }>();

  async authorize(input: AuthorizeInput): Promise<PaymentResult> {
    if (input.amount <= 0) {
      return { ok: false, externalId: null, status: 'failed', error: 'סכום לא תקין' };
    }
    const externalId = `mock_auth_${input.paymentId}`;
    this.authorizations.set(externalId, { amount: input.amount, captured: false });
    return {
      ok: true,
      externalId,
      status: 'authorized',
      raw: { mock: true, amount: input.amount, currency: input.currency },
    };
  }

  async capture(input: CaptureInput): Promise<PaymentResult> {
    const externalId = input.externalId ?? `mock_auth_${input.paymentId}`;
    const auth = this.authorizations.get(externalId);
    if (auth && input.amount > auth.amount) {
      return {
        ok: false,
        externalId,
        status: 'failed',
        error: 'לא ניתן לגבות סכום גבוה מההרשאה',
      };
    }
    this.authorizations.set(externalId, { amount: input.amount, captured: true });
    return { ok: true, externalId, status: 'captured', raw: { mock: true, amount: input.amount } };
  }

  async refund(input: RefundInput): Promise<PaymentResult> {
    return {
      ok: true,
      externalId: input.externalId ?? `mock_auth_${input.paymentId}`,
      status: 'refunded',
      raw: { mock: true, amount: input.amount, reason: input.reason ?? null },
    };
  }

  async parseWebhook() {
    // The mock adapter has no webhooks: state transitions happen inline.
    return null;
  }
}
