import crypto from 'node:crypto'
import type {
  CreatePaymentInput, CreatePaymentResult, PaymentProvider,
  RefundResult, VerifyPaymentResult, WebhookResult,
} from './types'

/**
 * Sandbox provider used until a PCI-compliant gateway is contracted.
 * It simulates a hosted redirect and a signed webhook so the whole order flow
 * — including idempotency — is exercised end to end without real credentials.
 */
export class SandboxPaymentProvider implements PaymentProvider {
  readonly name = 'sandbox'
  readonly isSandbox = true

  private readonly secret: string

  constructor(secret: string) {
    this.secret = secret
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const providerRef = `sbx_${crypto.createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 24)}`
    return {
      providerRef,
      status: 'PENDING',
      redirectUrl: `/checkout/sandbox?ref=${providerRef}&order=${encodeURIComponent(input.orderNumber)}`,
    }
  }

  async verifyPayment(providerRef: string): Promise<VerifyPaymentResult> {
    return { providerRef, status: 'PAID', amount: 0 }
  }

  async refundPayment(providerRef: string, amount: number): Promise<RefundResult> {
    return { providerRef: `${providerRef}_rf`, amount }
  }

  sign(body: string): string {
    return crypto.createHmac('sha256', this.secret).update(body).digest('hex')
  }

  async handleWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookResult> {
    const signature = headers['x-sandbox-signature'] ?? ''
    const expected = this.sign(rawBody)
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new Error('Invalid webhook signature')
    }
    const payload = JSON.parse(rawBody) as { id?: string; ref?: string; status?: string; amount?: number }
    if (!payload.id || !payload.ref) throw new Error('Malformed webhook payload')
    const status = payload.status === 'failed' ? 'FAILED' : payload.status === 'refunded' ? 'REFUNDED' : 'PAID'
    return { externalId: payload.id, providerRef: payload.ref, status, amount: payload.amount ?? null }
  }
}
