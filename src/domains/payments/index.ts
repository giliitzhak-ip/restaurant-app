import { MockPaymentProvider } from './mock-provider';
import type { PaymentProvider } from './provider';

export * from './fees';
export * from './provider';
export { MockPaymentProvider } from './mock-provider';

let cached: PaymentProvider | null = null;

/**
 * Resolve the configured payment adapter (spec §27).
 *
 * Only the mock adapter exists today, and it reports isReal = false. When a
 * real gateway is added it registers here; nothing else changes. Production
 * must never silently run on the mock: see assertPaymentProviderIsSafe.
 */
export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;
  cached = new MockPaymentProvider();
  return cached;
}

export function setPaymentProvider(provider: PaymentProvider | null): void {
  cached = provider;
}

/**
 * Guard against shipping a fake payment path to production (spec §53).
 * Called at startup of any route that takes money.
 */
export function assertPaymentProviderIsSafe(): void {
  const provider = getPaymentProvider();
  if (!provider.isReal && process.env.NODE_ENV === 'production' && process.env.DEMO_MODE !== 'true') {
    throw new Error(
      `Refusing to run in production with the "${provider.name}" payment adapter, ` +
        'which does not move real money. Configure a real PaymentProvider.',
    );
  }
}
