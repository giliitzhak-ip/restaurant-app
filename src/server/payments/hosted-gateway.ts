import { createId } from "@/lib/utils";
import type { PaymentProvider, PaymentIntentResult } from "./types";

/**
 * Adapter for a hosted-page Israeli gateway (Tranzila, Cardcom, Meshulam…).
 *
 * Every one of those providers works the same way: POST the order total and a
 * return URL, receive a payment page URL, redirect the customer, then verify
 * the callback. Fill in `PAYMENT_API_URL` / `PAYMENT_TERMINAL_ID` /
 * `PAYMENT_API_KEY` and implement the request body for the chosen provider —
 * the storefront needs nothing else.
 *
 * Until it is configured this adapter reports a clear failure instead of
 * pretending to charge a card.
 */
export const hostedGatewayProvider: PaymentProvider = {
  id: "hosted",
  label: "תשלום מאובטח בכרטיס אשראי",
  description:
    "התשלום מתבצע בעמוד מאובטח של ספק הסליקה. פרטי האשראי אינם עוברים ואינם נשמרים בשרתים שלנו.",
  async createIntent({ cart, returnUrl, orderReference }): Promise<PaymentIntentResult> {
    const endpoint = process.env.PAYMENT_API_URL;
    const terminal = process.env.PAYMENT_TERMINAL_ID;
    const key = process.env.PAYMENT_API_KEY;

    if (!endpoint || !terminal || !key) {
      return {
        status: "FAILED",
        reason:
          "PAYMENT_PROVIDER is set to a hosted gateway but PAYMENT_API_URL / PAYMENT_TERMINAL_ID / PAYMENT_API_KEY are missing.",
      };
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          terminal,
          amount: cart.totals.total,
          currency: "ILS",
          reference: orderReference,
          successUrl: returnUrl,
          cancelUrl: returnUrl,
        }),
        cache: "no-store",
      });

      if (!response.ok) {
        return { status: "FAILED", reason: `gateway responded ${response.status}` };
      }

      const payload = (await response.json()) as { url?: string; reference?: string };
      if (!payload.url) return { status: "FAILED", reason: "gateway returned no URL" };

      return {
        status: "REDIRECT",
        redirectUrl: payload.url,
        reference: payload.reference ?? createId("pay"),
      };
    } catch (error) {
      return {
        status: "FAILED",
        reason: error instanceof Error ? error.message : "gateway unreachable",
      };
    }
  },
};
