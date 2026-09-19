import { createHmac } from "node:crypto";
import { createId } from "@/lib/utils";
import { timingSafeEqualString } from "@/server/security/tokens";
import { fetchWithTimeout } from "@/server/http/fetch-with-timeout";
import {
  scrubPaymentPayload,
  type PaymentProvider,
  type PaymentIntentResult,
  type PaymentWebhookResult,
} from "./types";

/**
 * Adapter for a hosted-page Israeli gateway (Tranzila, Cardcom, Meshulam…).
 *
 * Every one of those providers works the same way: POST the order total plus
 * return URLs, receive a payment page URL, redirect the customer, then receive
 * a server-to-server callback with the result. Fill in the env vars below and
 * adjust the request/response field names for the chosen provider — nothing
 * outside this file needs to change.
 *
 * Until it is configured this adapter reports a clear failure instead of
 * pretending to charge a card.
 */
export const hostedGatewayProvider: PaymentProvider = {
  id: "hosted",
  label: "תשלום מאובטח בכרטיס אשראי",
  description:
    "התשלום מתבצע בעמוד מאובטח של ספק הסליקה. פרטי האשראי אינם עוברים ואינם נשמרים בשרתים שלנו.",
  supportsWebhook: true,

  async createIntent({
    successUrl,
    cancelUrl,
    webhookUrl,
    orderReference,
    amount,
    currency,
  }): Promise<PaymentIntentResult> {
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
      const response = await fetchWithTimeout(
        endpoint,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            terminal,
            // The amount the provider charges is the amount the server
            // computed — never a number that travelled through the browser.
            amount,
            currency,
            reference: orderReference,
            successUrl,
            cancelUrl,
            notifyUrl: webhookUrl,
          }),
          cache: "no-store",
        },
        { timeoutMs: 12_000, label: "payments.createIntent" },
      );

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

  /**
   * Verifies a callback.
   *
   * The signature is an HMAC-SHA256 of the raw request body keyed by
   * PAYMENT_WEBHOOK_SECRET, compared in constant time. The body is read as
   * text and hashed *before* parsing, because re-serialising JSON changes the
   * bytes and would break every signature.
   */
  async verifyWebhook(rawBody, headers): Promise<PaymentWebhookResult> {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!secret) return { ok: false, reason: "PAYMENT_WEBHOOK_SECRET is not configured" };

    const signature =
      headers.get("x-payment-signature") ??
      headers.get("x-signature") ??
      headers.get("x-cardcom-signature");
    if (!signature) return { ok: false, reason: "missing signature header" };

    const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    if (!timingSafeEqualString(signature.trim().toLowerCase(), expected)) {
      return { ok: false, reason: "signature mismatch" };
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return { ok: false, reason: "body is not JSON" };
    }

    const orderNumber = String(payload.reference ?? payload.orderNumber ?? "").trim();
    if (!orderNumber) return { ok: false, reason: "no order reference in payload" };

    const rawStatus = String(payload.status ?? "").toLowerCase();
    const outcome =
      rawStatus === "paid" || rawStatus === "approved" || rawStatus === "success"
        ? ("PAID" as const)
        : rawStatus === "cancelled" || rawStatus === "canceled"
          ? ("CANCELLED" as const)
          : ("FAILED" as const);

    const amount = Number(payload.amount);
    if (!Number.isFinite(amount)) return { ok: false, reason: "no amount in payload" };

    return {
      ok: true,
      event: {
        eventId: payload.eventId ? String(payload.eventId) : null,
        orderNumber,
        reference: payload.transactionId ? String(payload.transactionId) : null,
        outcome,
        amount,
        currency: String(payload.currency ?? "ILS").toUpperCase(),
        detail: scrubPaymentPayload(payload),
      },
    };
  },
};
