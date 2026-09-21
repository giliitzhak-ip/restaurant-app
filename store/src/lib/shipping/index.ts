import { getEnv } from '@/lib/env'
import { SandboxShippingProvider } from './sandbox'
import type { ShippingProvider } from './types'

export type * from './types'

let cached: ShippingProvider | null = null

export function getShippingProvider(): ShippingProvider {
  if (cached) return cached
  const env = getEnv()
  switch (env.SHIPPING_PROVIDER) {
    case 'sandbox':
      cached = new SandboxShippingProvider()
      break
    default:
      throw new Error(`ספק המשלוחים "${env.SHIPPING_PROVIDER}" אינו מוגדר.`)
  }
  return cached
}

export function __setShippingProviderForTests(provider: ShippingProvider | null): void {
  cached = provider
}
