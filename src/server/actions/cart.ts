"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  addToCart,
  applyCoupon,
  clearCart,
  getCart,
  removeCartItem,
  setCartItemUnits,
  setFulfilment,
  setInstallation,
} from "@/server/cart/cart-service";
import type { Cart, FulfilmentMethod } from "@/types/commerce";

const addSchema = z.object({
  productId: z.string().min(1),
  units: z.number().int().positive().max(999).optional(),
  sqm: z.number().positive().max(100000).optional(),
  sample: z.boolean().optional(),
  designId: z.string().nullish(),
  designLabel: z.string().nullish(),
});

export type CartActionResult =
  | { ok: true; cart: Cart }
  | { ok: false; error: string; cart: Cart };

function revalidate() {
  revalidatePath("/cart");
  revalidatePath("/checkout");
}

export async function addToCartAction(
  input: z.input<typeof addSchema>,
): Promise<CartActionResult> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "INVALID_INPUT", cart: await getCart() };
  }
  try {
    const cart = await addToCart({
      productId: parsed.data.productId,
      units: parsed.data.units,
      sqm: parsed.data.sqm,
      sample: parsed.data.sample,
      designId: parsed.data.designId ?? null,
      designLabel: parsed.data.designLabel ?? null,
    });
    revalidate();
    return { ok: true, cart };
  } catch {
    return { ok: false, error: "PRODUCT_NOT_FOUND", cart: await getCart() };
  }
}

export async function setCartUnitsAction(
  lineId: string,
  units: number,
): Promise<CartActionResult> {
  const cart = await setCartItemUnits(lineId, Math.round(units));
  revalidate();
  return { ok: true, cart };
}

export async function removeCartItemAction(lineId: string): Promise<CartActionResult> {
  const cart = await removeCartItem(lineId);
  revalidate();
  return { ok: true, cart };
}

export async function clearCartAction(): Promise<CartActionResult> {
  const cart = await clearCart();
  revalidate();
  return { ok: true, cart };
}

export async function applyCouponAction(code: string): Promise<CartActionResult> {
  const { cart, ok } = await applyCoupon(code);
  revalidate();
  return ok ? { ok: true, cart } : { ok: false, error: "INVALID_COUPON", cart };
}

export async function setInstallationAction(
  enabled: boolean,
  sqm?: number,
): Promise<CartActionResult> {
  const cart = await setInstallation(enabled, sqm);
  revalidate();
  return { ok: true, cart };
}

export async function setFulfilmentAction(
  method: FulfilmentMethod,
): Promise<CartActionResult> {
  const cart = await setFulfilment(method);
  revalidate();
  return { ok: true, cart };
}

export async function refreshCartAction(): Promise<Cart> {
  return getCart();
}
