"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkoutSchema, type CheckoutInput } from "@/features/checkout/schema";
import { commerce } from "@/config/brand";
import { routes, siteUrl } from "@/config/site";
import { getSessionUser } from "@/server/auth/session";
import { getCart } from "@/server/cart/cart-service";
import { getPaymentProvider } from "@/server/payments";
import { getRepository } from "@/server/repositories";
import { rateLimit } from "@/server/security/rate-limit";
import { createPublicToken } from "@/server/security/tokens";
import { log } from "@/server/observability/logger";
import { legalDocuments } from "@/config/legal";
import { MARKETING_CONSENT_TEXT } from "@/lib/consent";

export type { CheckoutInput };

export type CheckoutResult =
  | { ok: true; orderNumber: string; token: string; redirectUrl?: string }
  | {
      ok: false;
      error:
        | "INVALID_INPUT"
        | "EMPTY_CART"
        | "PAYMENT_FAILED"
        | "OUT_OF_STOCK"
        | "RATE_LIMITED";
      fieldErrors?: Record<string, string[]>;
      shortages?: { name: string; requested: number; available: number }[];
    };

/** Confirmation URL. The token is what authorises a guest to read the order. */
function confirmationUrl(number: string, token: string) {
  return `${siteUrl}${routes.order(number)}?token=${encodeURIComponent(token)}`;
}

/**
 * Writes the checkout consents. Never throws into the checkout path.
 */
async function recordCheckoutConsents(input: {
  orderId: string;
  email: string;
  userId: string | null;
  marketingOptIn: boolean;
}) {
  const repository = getRepository();
  try {
    await repository.recordConsent({
      kind: "PURCHASE_TERMS",
      source: "CHECKOUT",
      granted: true,
      documentVersion: `terms:${legalDocuments.terms.version}+privacy:${legalDocuments.privacy.version}`,
      orderId: input.orderId,
      email: input.email,
      userId: input.userId,
    });
  } catch (error) {
    log.error("checkout.terms_consent_failed", { orderId: input.orderId, error: String(error) });
  }

  // No row at all when the box was left unticked. An absent consent and a
  // recorded refusal are different things, and only the former is true here.
  if (!input.marketingOptIn) return;

  try {
    await repository.recordConsent({
      kind: "MARKETING",
      source: "CHECKOUT",
      granted: true,
      documentVersion: legalDocuments.privacy.version,
      orderId: input.orderId,
      email: input.email,
      userId: input.userId,
    });
    await repository.addNewsletterSignup({
      email: input.email,
      source: "CHECKOUT",
      consentText: MARKETING_CONSENT_TEXT,
      documentVersion: legalDocuments.privacy.version,
    });
  } catch (error) {
    log.error("checkout.marketing_consent_failed", { orderId: input.orderId, error: String(error) });
  }
}

/**
 * Places an order.
 *
 * The sequence matters, so it is spelled out:
 *
 *  1. rate limit, validate, re-price the cart **server-side** (`getCart`
 *     recomputes every line from the live catalogue — a tampered client total
 *     never reaches the gateway);
 *  2. deduplicate against an idempotency key, so a double-clicked button or a
 *     retried network request produces one order, not two;
 *  3. write the order and reserve stock in a single transaction;
 *  4. only then ask the provider for a payment intent.
 *
 * The cart is **not** cleared here for a gateway payment. It is cleared on the
 * confirmation page once the order is actually settled, because a customer who
 * abandons the payment page must come back to a full basket.
 */
export async function placeOrderAction(input: CheckoutInput): Promise<CheckoutResult> {
  const limited = await rateLimit("checkout");
  if (!limited.ok) return { ok: false, error: "RATE_LIMITED" };

  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const cart = await getCart();
  if (!cart.items.length) return { ok: false, error: "EMPTY_CART" };

  const data = parsed.data;
  const user = await getSessionUser();
  const repository = getRepository();
  const provider = getPaymentProvider();

  /*
   * Idempotency key: the client's nonce when it sent one, otherwise a digest
   * of the basket itself. Either way a resubmission of the same checkout
   * resolves to the same order instead of charging twice.
   */
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        cart: cart.id,
        total: cart.totals.total,
        items: cart.items.map((item) => [item.productId, item.units, item.unitPrice]),
        contact: [data.email, data.phone],
      }),
    )
    .digest("base64url")
    .slice(0, 32);
  const idempotencyKey = data.idempotencyKey?.trim()
    ? `ck_${data.idempotencyKey.trim().slice(0, 60)}`
    : `cf_${fingerprint}`;

  const existing = await repository.findOrderByIdempotencyKey(idempotencyKey);
  if (existing?.publicToken) {
    log.info("checkout.duplicate", { orderId: existing.id, status: existing.status });
    return { ok: true, orderNumber: existing.number, token: existing.publicToken };
  }

  const publicToken = createPublicToken();
  const entryStatus = provider.supportsWebhook ? "PAYMENT_PENDING" : "PENDING";

  const created = await repository.createOrder({
    status: entryStatus,
    publicToken,
    idempotencyKey,
    vatRate: commerce.vatRate,
    currency: commerce.currency,
    userId: user?.id ?? null,
    customerName: data.fullName,
    phone: data.phone,
    email: data.email,
    fulfilment: data.fulfilment,
    street: data.fulfilment === "SHIPPING" ? (data.street ?? null) : null,
    city: data.fulfilment === "SHIPPING" ? (data.city ?? null) : null,
    zip: data.zip ?? null,
    floor: data.floor ?? null,
    notes: data.notes ?? null,
    installation: cart.installation,
    couponCode: cart.couponCode,
    paymentProvider: provider.id,
    paymentReference: null,
    items: cart.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      imageUrl: item.imageUrl,
      units: item.units,
      unitPrice: item.unitPrice,
      coveredSqm: item.coveredSqm,
      lineTotal: item.lineTotal,
      designId: item.designId,
    })),
    subtotal: cart.totals.subtotal,
    discount: cart.totals.discount,
    shipping: cart.totals.shipping,
    installationTotal: cart.totals.installation,
    total: cart.totals.total,
  });

  if (!created.ok) {
    log.warn("checkout.out_of_stock", { shortages: created.shortages.length });
    return {
      ok: false,
      error: "OUT_OF_STOCK",
      shortages: created.shortages.map(({ name, requested, available }) => ({
        name,
        requested,
        available,
      })),
    };
  }

  const order = created.order;
  const token = order.publicToken ?? publicToken;
  if (created.duplicate) {
    return { ok: true, orderNumber: order.number, token };
  }

  /*
   * Record the consents against the order.
   *
   * Two separate rows, because they are two separate decisions: accepting the
   * terms of sale (a condition of buying) and agreeing to marketing (never a
   * condition of anything). Each carries the version of the document that was
   * actually on screen, so "which text did this customer agree to" is
   * answerable a year from now, after the terms have been revised twice.
   *
   * Failure here does not fail the order. The customer has paid or is about
   * to; losing the sale because an audit row would not write is the wrong
   * trade, and the failure is logged loudly instead.
   */
  await recordCheckoutConsents({
    orderId: order.id,
    email: data.email,
    userId: user?.id ?? null,
    marketingOptIn: data.marketingOptIn === true,
  });

  await repository.recordPaymentEvent({
    orderId: order.id,
    provider: provider.id,
    kind: "INTENT_CREATED",
    status: entryStatus,
    amount: order.total,
    currency: order.currency,
    reference: null,
  });

  const intent = await provider.createIntent({
    cart,
    customer: { fullName: data.fullName, email: data.email, phone: data.phone },
    successUrl: confirmationUrl(order.number, token),
    cancelUrl: `${siteUrl}${routes.checkout}?cancelled=${encodeURIComponent(order.number)}`,
    webhookUrl: `${siteUrl}/api/payments/webhook`,
    orderReference: order.number,
    amount: order.total,
    currency: order.currency,
  });

  if (intent.status === "FAILED") {
    // Nothing was charged. Fail the order and hand the stock back.
    await repository.transitionOrder({
      id: order.id,
      to: "PAYMENT_FAILED",
      expect: ["PAYMENT_PENDING", "PENDING"],
      releaseStock: true,
    });
    await repository.recordPaymentEvent({
      orderId: order.id,
      provider: provider.id,
      kind: "FAILED",
      status: "FAILED",
      amount: order.total,
      currency: order.currency,
      reference: null,
      detail: { reason: intent.reason },
    });
    log.error("checkout.intent_failed", { orderId: order.id, provider: provider.id, reason: intent.reason });
    return { ok: false, error: "PAYMENT_FAILED" };
  }

  await repository.recordPaymentEvent({
    orderId: order.id,
    provider: provider.id,
    kind: intent.status === "REDIRECT" ? "REDIRECTED" : "AUTHORISED",
    status: intent.status,
    amount: order.total,
    currency: order.currency,
    reference: intent.reference,
  });
  await repository.transitionOrder({
    id: order.id,
    to: entryStatus,
    paymentReference: intent.reference,
  });

  revalidatePath(routes.account.orders);
  log.info("checkout.placed", {
    orderId: order.id,
    provider: provider.id,
    status: entryStatus,
    total: order.total,
  });

  return {
    ok: true,
    orderNumber: order.number,
    token,
    redirectUrl: intent.status === "REDIRECT" ? intent.redirectUrl : undefined,
  };
}

/** Called from the cancel return URL: releases the hold the customer abandoned. */
export async function cancelPendingOrderAction(orderNumber: string): Promise<{ ok: boolean }> {
  const repository = getRepository();
  const order = await repository.getOrderByNumber(orderNumber);
  if (!order) return { ok: false };

  const user = await getSessionUser();
  // Only the owner may cancel; a guest order can be cancelled by anyone who
  // holds the number *and* is still in the pending window, which is the same
  // party that just came back from the payment page.
  if (order.userId && order.userId !== user?.id) return { ok: false };

  const moved = await repository.transitionOrder({
    id: order.id,
    to: "CANCELLED",
    expect: ["PAYMENT_PENDING"],
    releaseStock: true,
  });
  if (moved) {
    await repository.recordPaymentEvent({
      orderId: order.id,
      provider: order.paymentProvider,
      kind: "CANCELLED",
      status: "CANCELLED",
      amount: order.total,
      currency: order.currency,
      reference: order.paymentReference,
    });
  }
  return { ok: Boolean(moved) };
}
