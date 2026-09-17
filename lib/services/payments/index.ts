import { env } from '@/lib/env';
import { MockPaymentAdapter } from './mock-adapter';
import { StripePaymentAdapter } from './stripe-adapter';
import { IsraeliPaymentAdapter } from './israeli-adapter';
import type { PaymentAdapter } from './types';

let adapter: PaymentAdapter | null = null;

/**
 * Chooses the payment adapter from configuration, falling back to the mock when
 * credentials are missing so the flow is always exercisable end to end.
 */
export function getPaymentAdapter(): PaymentAdapter {
  if (adapter) return adapter;

  switch (env.paymentProvider) {
    case 'stripe': {
      if (env.paymentSecretKey) {
        adapter = new StripePaymentAdapter(env.paymentSecretKey, env.paymentWebhookSecret);
        break;
      }
      adapter = new MockPaymentAdapter();
      break;
    }
    case 'israeli': {
      const israeli = new IsraeliPaymentAdapter({
        apiKey: env.paymentSecretKey ?? '',
        endpoint: process.env.PAYMENT_ENDPOINT,
        terminalId: process.env.PAYMENT_TERMINAL_ID,
      });
      adapter = israeli.isLive ? israeli : new MockPaymentAdapter();
      break;
    }
    default:
      adapter = new MockPaymentAdapter();
  }

  return adapter;
}

/** Test seam: lets a test install a stub adapter. */
export function setPaymentAdapter(next: PaymentAdapter | null) {
  adapter = next;
}

export * from './types';
export { MockPaymentAdapter } from './mock-adapter';
