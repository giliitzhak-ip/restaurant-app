import type { OrderStatus } from "@/types/commerce";

/**
 * Order state machine.
 *
 * The rule this encodes is simple and load-bearing: **an order becomes PAID
 * only when the payment provider says so, out of band.** A browser redirect is
 * an attacker-controlled GET; it can be replayed, edited or skipped entirely,
 * so it may move an order no further than the confirmation screen it renders.
 *
 *   CART ─ checkout ─▶ PAYMENT_PENDING ─ webhook ─▶ PAID ─▶ PROCESSING ─▶ SHIPPED ─▶ COMPLETED
 *                            │                        └──▶ CANCELLED (refund path)
 *                            ├─ webhook/failure ─▶ PAYMENT_FAILED
 *                            └─ customer cancels ─▶ CANCELLED
 *
 *   CART ─ checkout (offline provider) ─▶ PENDING ─▶ PAID │ CANCELLED
 *
 * `CART` never reaches the database: the cart is its own model, and the first
 * Order row is written when checkout starts.
 */

export type OrderStage = "CART" | OrderStatus;

const TRANSITIONS: Record<OrderStage, readonly OrderStatus[]> = {
  CART: ["PAYMENT_PENDING", "PENDING"],
  PAYMENT_PENDING: ["PAID", "PAYMENT_FAILED", "CANCELLED"],
  PENDING: ["PAID", "PAYMENT_FAILED", "CANCELLED", "PROCESSING"],
  PAID: ["PROCESSING", "SHIPPED", "COMPLETED", "CANCELLED"],
  PAYMENT_FAILED: ["PAYMENT_PENDING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "COMPLETED", "CANCELLED"],
  SHIPPED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

/** Statuses that hold reserved stock. */
const HOLDS_STOCK: readonly OrderStatus[] = [
  "PAYMENT_PENDING",
  "PENDING",
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "COMPLETED",
];

/** Statuses where the customer's money is confirmed. */
const SETTLED: readonly OrderStatus[] = ["PAID", "PROCESSING", "SHIPPED", "COMPLETED"];

export function canTransition(from: OrderStage, to: OrderStatus): boolean {
  if (from === to) return true; // idempotent replays are not errors
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OrderStage, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal order transition ${from} → ${to}`);
  }
}

/** Which current statuses a webhook may move to `to`. */
export function allowedSources(to: OrderStatus): OrderStatus[] {
  return (Object.keys(TRANSITIONS) as OrderStage[])
    .filter((from): from is OrderStatus => from !== "CART")
    .filter((from) => TRANSITIONS[from].includes(to));
}

export function holdsStock(status: OrderStatus): boolean {
  return HOLDS_STOCK.includes(status);
}

export function isSettled(status: OrderStatus): boolean {
  return SETTLED.includes(status);
}

/** True once the customer's basket may be emptied. */
export function clearsCart(status: OrderStatus): boolean {
  return status === "PENDING" || isSettled(status);
}

/** Statuses an admin is allowed to set by hand. */
export const ADMIN_SETTABLE: readonly OrderStatus[] = [
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "COMPLETED",
  "CANCELLED",
];
