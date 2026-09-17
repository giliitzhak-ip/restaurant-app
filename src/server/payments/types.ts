import type { Cart } from "@/types/commerce";

export interface PaymentIntentInput {
  cart: Cart;
  customer: { fullName: string; email: string; phone: string };
  /** Where the provider should send the customer back to. */
  returnUrl: string;
  orderReference: string;
}

export type PaymentIntentResult =
  | {
      /** Card details are collected on the provider's hosted page. */
      status: "REDIRECT";
      redirectUrl: string;
      reference: string;
    }
  | {
      /** Captured immediately (or recorded for offline settlement). */
      status: "AUTHORISED";
      reference: string;
    }
  | { status: "FAILED"; reason: string };

/**
 * Payment providers.
 *
 * The storefront never sees, transmits or stores card data: a provider either
 * authorises out of band (the default "manual" flow, where the showroom takes
 * payment) or hands back a hosted-page URL. Adding an Israeli gateway means
 * writing one adapter here and setting PAYMENT_PROVIDER — no changes anywhere
 * else in the app.
 */
export interface PaymentProvider {
  readonly id: string;
  readonly label: string;
  /** Copy shown to the customer at checkout. */
  readonly description: string;
  createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult>;
}
