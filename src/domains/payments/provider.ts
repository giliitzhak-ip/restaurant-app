/**
 * PaymentProvider abstraction (spec §27).
 *
 * Every operation takes an idempotency key: a retried authorize, capture,
 * refund or payout must never charge or pay twice. Amounts are always
 * integers in agorot and are always supplied by the server — a client-sent
 * price is never passed through here (spec §45).
 */

export interface PaymentIntentRequest {
  readonly idempotencyKey: string;
  readonly amount: number;
  readonly currency: string;
  readonly jobId: string;
  readonly customerId: string;
  readonly description?: string;
}

export interface PaymentOperationResult {
  readonly ok: boolean;
  readonly externalRef: string | null;
  readonly status: 'pending' | 'succeeded' | 'failed';
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly raw?: Record<string, unknown>;
}

export interface CaptureRequest {
  readonly idempotencyKey: string;
  readonly externalRef: string;
  /** Capture less than authorised when the final price came in lower. */
  readonly amount: number;
}

export interface RefundRequest {
  readonly idempotencyKey: string;
  readonly externalRef: string;
  readonly amount: number;
  readonly reason?: string;
}

export interface PayoutRequest {
  readonly idempotencyKey: string;
  readonly providerId: string;
  readonly amount: number;
  readonly currency: string;
  readonly jobId: string;
}

export interface PaymentProvider {
  readonly name: string;
  /**
   * False for any adapter that does not move real money. The application
   * uses this to label the UI honestly (spec §53).
   */
  readonly isReal: boolean;

  authorize(request: PaymentIntentRequest): Promise<PaymentOperationResult>;
  capture(request: CaptureRequest): Promise<PaymentOperationResult>;
  refund(request: RefundRequest): Promise<PaymentOperationResult>;
  partialRefund(request: RefundRequest): Promise<PaymentOperationResult>;
  createProviderPayout(request: PayoutRequest): Promise<PaymentOperationResult>;
}

export class PaymentError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}
