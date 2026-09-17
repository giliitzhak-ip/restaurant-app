"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  checkoutSchema,
  type CheckoutInput,
} from "@/features/checkout/schema";
import { routes, siteUrl } from "@/config/site";
import { getSessionUser } from "@/server/auth/session";
import { clearCart, getCart } from "@/server/cart/cart-service";
import { getPaymentProvider } from "@/server/payments";
import { getRepository } from "@/server/repositories";
import { generateOrderNumber } from "@/server/commerce/pricing";

export type { CheckoutInput };



export type CheckoutResult =
  | { ok: true; orderNumber: string; redirectUrl?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function placeOrderAction(input: CheckoutInput): Promise<CheckoutResult> {
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
  const provider = getPaymentProvider();
  const reference = generateOrderNumber();

  const intent = await provider.createIntent({
    cart,
    customer: { fullName: data.fullName, email: data.email, phone: data.phone },
    returnUrl: `${siteUrl}${routes.checkout}`,
    orderReference: reference,
  });

  if (intent.status === "FAILED") {
    // Nothing is charged and no order is written — the customer can retry.
    console.error(`[payments] ${provider.id} failed: ${intent.reason}`);
    return { ok: false, error: "PAYMENT_FAILED" };
  }

  const order = await getRepository().createOrder({
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
    paymentReference: intent.status === "AUTHORISED" ? intent.reference : intent.reference,
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

  await clearCart();
  revalidatePath(routes.cart);
  revalidatePath(routes.account.orders);

  return {
    ok: true,
    orderNumber: order.number,
    redirectUrl: intent.status === "REDIRECT" ? intent.redirectUrl : undefined,
  };
}
