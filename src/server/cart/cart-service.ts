import { cookies } from "next/headers";
import { commerce } from "@/config/brand";
import { createId, clamp } from "@/lib/utils";
import { roundTo } from "@/lib/format";
import {
  emptyCartRecord,
  hydrateCart,
  unitsForArea,
  type CartRecord,
} from "@/server/commerce/pricing";
import { getRepository } from "@/server/repositories";
import { getSessionUser } from "@/server/auth/session";
import type { Cart, FulfilmentMethod } from "@/types/commerce";
import type { Product } from "@/types/catalog";

const COOKIE = "tn_cart";

async function readCartId() {
  const store = await cookies();
  return store.get(COOKIE)?.value ?? null;
}

/** Only callable from a server action or route handler (it writes a cookie). */
async function ensureCartId() {
  const store = await cookies();
  const existing = store.get(COOKIE)?.value;
  if (existing) return existing;
  const id = createId("cart");
  store.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 60,
  });
  return id;
}

async function loadRecord(id: string): Promise<CartRecord> {
  const repository = getRepository();
  const existing = await repository.getCart(id);
  if (existing) return existing;
  const user = await getSessionUser();
  return emptyCartRecord(id, user?.id ?? null);
}

async function hydrate(record: CartRecord): Promise<Cart> {
  const repository = getRepository();
  const products = await repository.getProductsByIds(
    record.items.map((item) => item.productId),
  );
  const coupon = record.couponCode
    ? await repository.getCoupon(record.couponCode)
    : null;
  return hydrateCart(
    record,
    new Map(products.map((product) => [product.id, product])),
    coupon,
  );
}

/** Read-only: safe to call from a server component. */
export async function getCart(): Promise<Cart> {
  const id = await readCartId();
  if (!id) return hydrate(emptyCartRecord("cart_guest"));
  return hydrate(await loadRecord(id));
}

async function mutate(
  apply: (record: CartRecord, context: { products: Product[] }) => Promise<void> | void,
): Promise<Cart> {
  const repository = getRepository();
  const id = await ensureCartId();
  const record = await loadRecord(id);
  const products = await repository.getProductsByIds(
    record.items.map((item) => item.productId),
  );
  await apply(record, { products });
  const saved = await repository.saveCart(record);
  return hydrate(saved);
}

export async function addToCart(input: {
  productId: string;
  units?: number;
  sqm?: number;
  sample?: boolean;
  designId?: string | null;
  designLabel?: string | null;
}): Promise<Cart> {
  const repository = getRepository();
  const product = await repository.getProductById(input.productId);
  if (!product) throw new Error("PRODUCT_NOT_FOUND");

  const units = input.sample
    ? 1
    : input.sqm !== undefined && input.sqm > 0
      ? unitsForArea(product, input.sqm)
      : clamp(Math.round(input.units ?? 1), 1, 999);

  return mutate((record) => {
    // Lines from a saved design stay separate so the customer can see what
    // came from which room.
    const existing = record.items.find(
      (item) =>
        item.productId === product.id &&
        item.sample === Boolean(input.sample) &&
        (item.designId ?? null) === (input.designId ?? null),
    );
    if (existing) {
      existing.units = clamp(existing.units + units, 1, 999);
      if (input.sqm) {
        existing.requestedSqm = roundTo((existing.requestedSqm ?? 0) + input.sqm, 2);
      }
      return;
    }
    record.items.push({
      id: createId("line"),
      productId: product.id,
      units,
      requestedSqm: input.sqm ? roundTo(input.sqm, 2) : null,
      sample: Boolean(input.sample),
      designId: input.designId ?? null,
      designLabel: input.designLabel ?? null,
    });
  });
}

export async function setCartItemUnits(lineId: string, units: number) {
  return mutate((record) => {
    const line = record.items.find((item) => item.id === lineId);
    if (!line) return;
    if (units <= 0) {
      record.items = record.items.filter((item) => item.id !== lineId);
      return;
    }
    line.units = clamp(Math.round(units), 1, 999);
  });
}

export async function removeCartItem(lineId: string) {
  return mutate((record) => {
    record.items = record.items.filter((item) => item.id !== lineId);
  });
}

export async function clearCart() {
  return mutate((record) => {
    record.items = [];
    record.couponCode = null;
    record.installation = false;
    record.installationSqm = 0;
  });
}

/**
 * Empties the basket once an order is actually settled.
 *
 * Deliberately tolerant: it is called from the confirmation page, which a
 * customer may open twice, from a different device, or long after the order
 * moved on. Clearing an already-empty cart is a no-op, and clearing someone
 * else's is impossible because the cart is addressed by this browser's cookie.
 */
export async function clearCartIfMatches(_orderIdempotencyKey: string | null) {
  const store = await cookies();
  if (!store.get(COOKIE)?.value) return;
  const cart = await getCart();
  if (!cart.items.length) return;
  await clearCart();
}

export type CouponOutcome = "APPLIED" | "CLEARED" | "INVALID" | "MIN_NOT_MET";

export async function applyCoupon(
  code: string,
): Promise<{ cart: Cart; outcome: CouponOutcome; minSubtotal?: number }> {
  const repository = getRepository();
  const trimmed = code.trim();
  if (!trimmed) {
    return {
      cart: await mutate((record) => void (record.couponCode = null)),
      outcome: "CLEARED",
    };
  }

  const coupon = await repository.getCoupon(trimmed);
  const expired =
    coupon?.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now();
  if (!coupon || !coupon.active || expired) {
    return { cart: await getCart(), outcome: "INVALID" };
  }

  const cart = await mutate((record) => {
    record.couponCode = coupon.code;
  });

  // A real code that simply misses its minimum spend gets its own message —
  // "invalid code" would send the customer looking for a typo.
  if (cart.totals.discount <= 0) {
    return {
      cart,
      outcome: "MIN_NOT_MET",
      minSubtotal: coupon.minSubtotal ?? undefined,
    };
  }
  return { cart, outcome: "APPLIED" };
}

export async function setInstallation(enabled: boolean, sqm?: number) {
  return mutate((record) => {
    record.installation = enabled && commerce.installationPricePerSqm !== null;
    record.installationSqm = enabled ? roundTo(sqm ?? 0, 2) : 0;
  });
}

export async function setFulfilment(method: FulfilmentMethod) {
  return mutate((record) => {
    record.fulfilment = method;
  });
}

export async function attachCartToUser(userId: string) {
  const id = await readCartId();
  if (!id) return;
  const repository = getRepository();
  const record = await repository.getCart(id);
  if (!record) return;
  record.userId = userId;
  await repository.saveCart(record);
}

export async function dropCartCookie() {
  const store = await cookies();
  store.delete(COOKIE);
}
