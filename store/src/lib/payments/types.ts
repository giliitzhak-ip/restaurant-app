import type { PaymentStatus } from '@/generated/prisma/enums'

export interface CreatePaymentInput {
  orderId: string
  orderNumber: string
  amount: number
  currency: string
  customerEmail: string
  returnUrl: string
  idempotencyKey: string
}

export interface CreatePaymentResult {
  providerRef: string
  status: PaymentStatus
  /** Hosted page the customer is redirected to. Card data never touches us. */
  redirectUrl: string | null
}

export interface VerifyPaymentResult {
  providerRef: string
  status: PaymentStatus
  amount: number
}

export interface RefundResult {
  providerRef: string
  amount: number
}

export interface WebhookResult {
  /** Stable event id used for idempotent processing. */
  externalId: string
  providerRef: string
  status: PaymentStatus
  amount: number | null
}

/**
 * Card numbers and CVV are never received, logged or stored by this
 * application. Every provider must use a hosted or tokenised flow.
 */
export interface PaymentProvider {
  readonly name: string
  readonly isSandbox: boolean
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>
  verifyPayment(providerRef: string): Promise<VerifyPaymentResult>
  refundPayment(providerRef: string, amount: number): Promise<RefundResult>
  /** Verifies the signature and normalises the payload. Throws when invalid. */
  handleWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookResult>
}
