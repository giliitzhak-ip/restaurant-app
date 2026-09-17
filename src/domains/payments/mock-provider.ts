import type {
  CaptureRequest,
  PaymentIntentRequest,
  PaymentOperationResult,
  PaymentProvider,
  PayoutRequest,
  RefundRequest,
} from './provider';

/**
 * TEST PAYMENT ADAPTER — moves no money (spec §27, §53).
 *
 * `isReal` is false, and the UI is required to label any payment made
 * through this adapter as a test payment. It never reports a real charge.
 *
 * It is a genuine implementation of the interface, not a stub: it enforces
 * idempotency, rejects over-capture and over-refund, and can be told to fail
 * deterministically so the failure paths in spec §44 are actually testable.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly isReal = false;

  /** idempotencyKey -> result, so a retry returns the first outcome. */
  private readonly operations = new Map<string, PaymentOperationResult>();
  private readonly authorizations = new Map<
    string,
    { amount: number; captured: number; refunded: number }
  >();

  /**
   * Test hook: any job id in this set fails authorization. Used by the
   * payment-failure tests — a failed payment must never mark a job PAID.
   */
  readonly failingJobIds = new Set<string>();

  private replay(key: string): PaymentOperationResult | null {
    return this.operations.get(key) ?? null;
  }

  private remember(key: string, result: PaymentOperationResult): PaymentOperationResult {
    this.operations.set(key, result);
    return result;
  }

  async authorize(request: PaymentIntentRequest): Promise<PaymentOperationResult> {
    const replayed = this.replay(request.idempotencyKey);
    if (replayed) return replayed;

    if (request.amount <= 0) {
      return this.remember(request.idempotencyKey, {
        ok: false, externalRef: null, status: 'failed',
        errorCode: 'INVALID_AMOUNT',
        errorMessage: 'Authorization amount must be positive',
      });
    }

    if (this.failingJobIds.has(request.jobId)) {
      return this.remember(request.idempotencyKey, {
        ok: false, externalRef: null, status: 'failed',
        errorCode: 'CARD_DECLINED',
        errorMessage: 'Test adapter: card declined for this job',
      });
    }

    const externalRef = `mock_auth_${request.jobId.slice(0, 8)}_${request.amount}`;
    this.authorizations.set(externalRef, { amount: request.amount, captured: 0, refunded: 0 });

    return this.remember(request.idempotencyKey, {
      ok: true, externalRef, status: 'succeeded',
      raw: { adapter: 'mock', note: 'no real funds moved' },
    });
  }

  async capture(request: CaptureRequest): Promise<PaymentOperationResult> {
    const replayed = this.replay(request.idempotencyKey);
    if (replayed) return replayed;

    const auth = this.authorizations.get(request.externalRef);
    if (!auth) {
      return this.remember(request.idempotencyKey, {
        ok: false, externalRef: request.externalRef, status: 'failed',
        errorCode: 'UNKNOWN_AUTHORIZATION',
        errorMessage: 'No such authorization',
      });
    }
    if (request.amount + auth.captured > auth.amount) {
      return this.remember(request.idempotencyKey, {
        ok: false, externalRef: request.externalRef, status: 'failed',
        errorCode: 'CAPTURE_EXCEEDS_AUTHORIZATION',
        errorMessage: `Cannot capture ${request.amount} against ${auth.amount - auth.captured} remaining`,
      });
    }

    auth.captured += request.amount;
    return this.remember(request.idempotencyKey, {
      ok: true, externalRef: request.externalRef, status: 'succeeded',
      raw: { adapter: 'mock', captured: auth.captured },
    });
  }

  async refund(request: RefundRequest): Promise<PaymentOperationResult> {
    return this.doRefund(request);
  }

  async partialRefund(request: RefundRequest): Promise<PaymentOperationResult> {
    return this.doRefund(request);
  }

  private async doRefund(request: RefundRequest): Promise<PaymentOperationResult> {
    const replayed = this.replay(request.idempotencyKey);
    if (replayed) return replayed;

    const auth = this.authorizations.get(request.externalRef);
    if (!auth) {
      return this.remember(request.idempotencyKey, {
        ok: false, externalRef: request.externalRef, status: 'failed',
        errorCode: 'UNKNOWN_AUTHORIZATION', errorMessage: 'No such authorization',
      });
    }
    if (request.amount + auth.refunded > auth.captured) {
      return this.remember(request.idempotencyKey, {
        ok: false, externalRef: request.externalRef, status: 'failed',
        errorCode: 'REFUND_EXCEEDS_CAPTURE',
        errorMessage: 'Cannot refund more than was captured',
      });
    }

    auth.refunded += request.amount;
    return this.remember(request.idempotencyKey, {
      ok: true, externalRef: request.externalRef, status: 'succeeded',
      raw: { adapter: 'mock', refunded: auth.refunded },
    });
  }

  async createProviderPayout(request: PayoutRequest): Promise<PaymentOperationResult> {
    const replayed = this.replay(request.idempotencyKey);
    if (replayed) return replayed;

    if (request.amount <= 0) {
      return this.remember(request.idempotencyKey, {
        ok: false, externalRef: null, status: 'failed',
        errorCode: 'INVALID_AMOUNT', errorMessage: 'Payout amount must be positive',
      });
    }

    return this.remember(request.idempotencyKey, {
      ok: true,
      externalRef: `mock_payout_${request.providerId.slice(0, 8)}_${request.amount}`,
      status: 'succeeded',
      raw: { adapter: 'mock', note: 'no real funds moved' },
    });
  }
}
