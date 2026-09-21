import { getEnv } from '@/lib/env'
import { SandboxPaymentProvider } from './sandbox'
import type { PaymentProvider } from './types'

export type * from './types'

let cached: PaymentProvider | null = null

export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached
  const env = getEnv()
  switch (env.PAYMENT_PROVIDER) {
    case 'sandbox':
      cached = new SandboxPaymentProvider(env.AUTH_SECRET)
      break
    default:
      throw new Error(
        `ספק הסליקה "${env.PAYMENT_PROVIDER}" אינו מוגדר. הוסיפו מימוש ב-src/lib/payments ורשמו אותו כאן.`,
      )
  }
  return cached
}

export function __setPaymentProviderForTests(provider: PaymentProvider | null): void {
  cached = provider
}
