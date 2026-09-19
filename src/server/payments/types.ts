import type { Cart } from "@/types/commerce";

export interface PaymentIntentInput {
  cart: Cart;
  customer: { fullName: string; email: string; phone: string };
  /** Where the provider sends a customer who completed the payment page. */
  successUrl: string;
  /** Where it sends one who backed out. Separate, so the two are distinguishable. */
  cancelUrl: string;
  /** Server-to-server result callback. */
  webhookUrl: string;
  orderReference: string;
  amount: number;
  currency: string;
}

export type PaymentIntentResult =
  | {
      /** Card details are collected on the provider's hosted page. */
      status: "REDIRECT";
      redirectUrl: string;
      reference: string;
    }
  | {
      /**
       * No online capture: the order is recorded and settled offline. This is
       * *not* "paid" — the order sits in PENDING until a human confirms.
       */
      status: "OFFLINE";
      reference: string;
    }
  | { status: "FAILED"; reason: string };

/** What a verified provider callback tells us. */
export interface PaymentWebhookEvent {
  /** Provider event id; used to make replays no-ops. */
  eventId: string | null;
  orderNumber: string;
  reference: string | null;
  outcome: "PAID" | "FAILED" | "CANCELLED";
  amount: number;
  currency: string;
  /** Already scrubbed of anything card-shaped. */
  detail: Record<string, unknown>;
}

export type PaymentWebhookResult =
  | { ok: true; event: PaymentWebhookEvent }
  | { ok: false; reason: string };

/**
 * Payment providers.
 *
 * The storefront never sees, transmits or stores card data: a provider either
 * settles out of band (the default "manual" flow, where the showroom takes
 * payment) or hands back a hosted-page URL. Adding an Israeli gateway means
 * writing one adapter here and setting PAYMENT_PROVIDER — no changes anywhere
 * else in the app.
 *
 * `verifyWebhook` is the only thing allowed to mark an order PAID. A browser
 * coming back from the payment page proves nothing.
 */
export interface PaymentProvider {
  readonly id: string;
  readonly label: string;
  /** Copy shown to the customer at checkout. */
  readonly description: string;
  /** False when the provider settles offline and never calls back. */
  readonly supportsWebhook: boolean;
  createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult>;
  verifyWebhook(rawBody: string, headers: Headers): Promise<PaymentWebhookResult>;
}

/**
 * Removes anything that could be card data before a payload is logged.
 *
 * Providers are inconsistent about what they echo back, and a single stray
 * `card_number` in a JSON blob drags the whole database into PCI scope. The
 * rule here is deny-by-pattern on keys plus a PAN-shaped value scrub.
 */
const FORBIDDEN_KEY = /(card|pan|cvv|cvc|expiry|exp_month|exp_year|track|holder|iban|account_number)/i;
const PAN_LIKE = /\b(?:\d[ -]?){13,19}\b/g;

export function scrubPaymentPayload(value: unknown, depth = 0): Record<string, unknown> {
  if (depth > 6 || value === null || typeof value !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEY.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (typeof raw === "string") {
      out[key] = raw.replace(PAN_LIKE, "[redacted]").slice(0, 500);
    } else if (typeof raw === "number" || typeof raw === "boolean" || raw === null) {
      out[key] = raw;
    } else if (Array.isArray(raw)) {
      out[key] = raw.slice(0, 20).map((entry) => scrubPaymentPayload(entry, depth + 1));
    } else if (typeof raw === "object") {
      out[key] = scrubPaymentPayload(raw, depth + 1);
    }
  }
  return out;
}
