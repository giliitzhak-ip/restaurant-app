import { NextResponse } from "next/server";
import { commerce } from "@/config/brand";
import { getPaymentProvider } from "@/server/payments";
import { getRepository } from "@/server/repositories";
import { log, captureError } from "@/server/observability/logger";

/**
 * Payment callback.
 *
 * This route is the **only** thing in the application that may move an order
 * to PAID. A customer returning from the payment page proves nothing: that
 * redirect is a GET they control, and treating it as proof of payment is how
 * shops end up shipping goods nobody paid for.
 *
 * Four checks before anything is written:
 *   1. the signature over the raw body verifies against PAYMENT_WEBHOOK_SECRET;
 *   2. the referenced order exists and is in a state that may move;
 *   3. the amount matches the order total the server computed;
 *   4. the currency matches.
 *
 * Replays are harmless: the provider's event id is UNIQUE in the payment log,
 * and the status change is a compare-and-set.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const provider = getPaymentProvider();
  if (!provider.supportsWebhook) {
    return NextResponse.json({ ok: false, error: "NO_WEBHOOK" }, { status: 404 });
  }

  // The signature covers the exact bytes sent, so the body is read as text and
  // verified before it is parsed.
  const rawBody = await request.text();
  const verification = await provider.verifyWebhook(rawBody, request.headers);

  if (!verification.ok) {
    log.warn("payments.webhook.rejected", { provider: provider.id, reason: verification.reason });
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const event = verification.event;
  const repository = getRepository();

  try {
    const order = await repository.getOrderByNumber(event.orderNumber);
    if (!order) {
      log.warn("payments.webhook.unknown_order", { provider: provider.id });
      // 200 so the provider stops retrying an order we will never have.
      return NextResponse.json({ ok: true, ignored: "unknown order" });
    }

    const amountMatches = Math.abs(event.amount - order.total) < 0.01;
    const currencyMatches = event.currency === order.currency;
    if (!amountMatches || !currencyMatches) {
      await repository.recordPaymentEvent({
        orderId: order.id,
        provider: provider.id,
        kind: "WEBHOOK_RECEIVED",
        status: "MISMATCH",
        amount: event.amount,
        currency: event.currency,
        reference: event.reference,
        eventId: event.eventId,
        detail: { ...event.detail, expectedAmount: order.total, expectedCurrency: order.currency },
      });
      log.error("payments.webhook.amount_mismatch", {
        orderId: order.id,
        expected: order.total,
        received: event.amount,
        expectedCurrency: order.currency,
        receivedCurrency: event.currency,
      });
      return NextResponse.json({ ok: false, error: "AMOUNT_MISMATCH" }, { status: 409 });
    }

    const logged = await repository.recordPaymentEvent({
      orderId: order.id,
      provider: provider.id,
      kind: "WEBHOOK_RECEIVED",
      status: event.outcome,
      amount: event.amount,
      currency: event.currency,
      reference: event.reference,
      eventId: event.eventId,
      detail: event.detail,
    });
    if (logged.duplicate) {
      log.info("payments.webhook.replay", { orderId: order.id });
      return NextResponse.json({ ok: true, duplicate: true });
    }

    if (event.outcome === "PAID") {
      const moved = await repository.transitionOrder({
        id: order.id,
        to: "PAID",
        expect: ["PAYMENT_PENDING", "PENDING"],
        paymentReference: event.reference ?? order.paymentReference,
      });
      log.info("payments.webhook.paid", { orderId: order.id, applied: Boolean(moved) });
    } else {
      const moved = await repository.transitionOrder({
        id: order.id,
        to: event.outcome === "CANCELLED" ? "CANCELLED" : "PAYMENT_FAILED",
        expect: ["PAYMENT_PENDING", "PENDING"],
        // A payment that will not complete must not keep holding stock.
        releaseStock: true,
      });
      log.info("payments.webhook.not_paid", {
        orderId: order.id,
        outcome: event.outcome,
        applied: Boolean(moved),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    await captureError(error, { route: "payments.webhook", provider: provider.id });
    // 500 asks the provider to retry; the event id keeps that safe.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

/** Providers occasionally probe the endpoint before going live. */
export async function GET() {
  const provider = getPaymentProvider();
  return NextResponse.json({
    ok: true,
    provider: provider.id,
    webhook: provider.supportsWebhook,
    currency: commerce.currency,
  });
}
