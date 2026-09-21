"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getRepository } from "@/server/repositories";
import { rateLimit } from "@/server/security/rate-limit";
import { log } from "@/server/observability/logger";

/**
 * Cancellation and return requests.
 *
 * Three decisions in here are deliberate and worth stating, because each one
 * is a place where the convenient implementation would have been the wrong
 * one:
 *
 *  1. **Nothing is decided automatically.** The action records the notice and
 *     nothing else. It does not cancel the order, does not refund, and above
 *     all does not rule that a made-to-measure item is non-cancellable. The
 *     exemption for goods made to the consumer's specification is narrow and
 *     fact-dependent — whether this particular board was cut for this
 *     particular customer, and whether production had started — and that is a
 *     human call. The code's job is to make sure a human sees it.
 *
 *  2. **The order is never deleted or auto-transitioned.** A cancellation
 *     request is a separate record pointing at the order. The order's own
 *     status changes only when someone in the office acts on it.
 *
 *  3. **A reason is optional.** The form does not require one and neither does
 *     this schema. Demanding a justification before accepting a cancellation
 *     notice is a friction pattern, and the right to cancel does not depend on
 *     the consumer explaining themselves.
 */

const itemSchema = z.object({
  orderItemId: z.string().max(64).nullable().optional(),
  productName: z.string().trim().min(1).max(200),
  quantity: z.number().int().min(1).max(9999),
});

const schema = z.object({
  orderNumber: z.string().trim().min(3).max(40),
  customerName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(6).max(40),
  /** Empty means "the whole order", which is the common case. */
  items: z.array(itemSchema).max(60).default([]),
  reason: z.string().trim().max(2000).nullable().default(null),
  attachmentKey: z.string().trim().max(300).nullable().default(null),
  /** Must be ticked: this is the customer confirming the notice is theirs. */
  confirm: z.literal(true),
});

export type CancellationInput = z.input<typeof schema>;

export type CancellationResult =
  | { ok: true; reference: string }
  | {
      ok: false;
      error: "INVALID_INPUT" | "RATE_LIMITED" | "FAILED";
      fieldErrors?: Record<string, string[]>;
    };

function ipPrefix(raw: string | null): string | null {
  if (!raw) return null;
  const address = raw.split(",")[0]?.trim();
  if (!address) return null;
  if (address.includes(":")) return address.split(":").slice(0, 3).join(":") + "::/48";
  const octets = address.split(".");
  return octets.length === 4 ? `${octets[0]}.${octets[1]}.${octets[2]}.0/24` : null;
}

export async function submitCancellationAction(
  input: CancellationInput,
): Promise<CancellationResult> {
  const limited = await rateLimit("cancellation");
  if (!limited.ok) return { ok: false, error: "RATE_LIMITED" };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const data = parsed.data;
  const repository = getRepository();

  /*
   * Resolve the order if the number matches one, but do not require it.
   *
   * A customer who mistypes their order number has still given notice, and the
   * clock on a cancellation right should not depend on them getting a
   * reference right. The typed number is stored either way so the office can
   * find it; an unresolved one simply arrives without a link.
   *
   * Note what is *not* here: no check of whether the number belongs to this
   * email. Refusing a mismatch would leak which numbers exist, and accepting a
   * notice that later turns out to be about someone else's order is a problem
   * a human resolves — not a reason to drop it on the floor.
   */
  let orderId: string | null = null;
  try {
    const order = await repository.getOrderByNumber(data.orderNumber.trim());
    orderId = order?.id ?? null;
  } catch (error) {
    log.warn("cancellation.order_lookup_failed", { error: String(error) });
  }

  try {
    const { reference } = await repository.createCancellationRequest({
      orderNumber: data.orderNumber.trim(),
      orderId,
      customerName: data.customerName,
      email: data.email.toLowerCase(),
      phone: data.phone,
      items: data.items,
      reason: data.reason,
      attachmentKey: data.attachmentKey,
      ipPrefix: ipPrefix((await headers()).get("x-forwarded-for")),
    });

    /*
     * Audit entry. The customer's own contact details are not repeated here —
     * the request row already holds them, and the audit log is read by more
     * people than the request queue is.
     */
    await repository.recordAuditEvent({
      actorId: null,
      actorEmail: null,
      action: "cancellation.received",
      entity: "CancellationRequest",
      entityId: reference,
      detail: { orderNumber: data.orderNumber.trim(), matchedOrder: Boolean(orderId) },
    });

    log.info("cancellation.received", { reference, matchedOrder: Boolean(orderId) });
    return { ok: true, reference };
  } catch (error) {
    log.error("cancellation.failed", { error: String(error) });
    return { ok: false, error: "FAILED" };
  }
}
