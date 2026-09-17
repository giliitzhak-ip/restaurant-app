"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes, siteUrl } from "@/config/site";
import { getSessionUser } from "@/server/auth/session";
import { clearCart, getCart } from "@/server/cart/cart-service";
import { getPaymentProvider } from "@/server/payments";
import { getRepository } from "@/server/repositories";
import { generateOrderNumber } from "@/server/commerce/pricing";

export const checkoutSchema = z
  .object({
    fullName: z.string().trim().min(2, "נדרש שם מלא"),
    phone: z
      .string()
      .trim()
      .regex(/^0\d{1,2}-?\d{7}$|^\+972\d{8,9}$/, "מספר טלפון לא תקין"),
    email: z.string().trim().email("אימייל לא תקין"),
    fulfilment: z.enum(["SHIPPING", "PICKUP"]),
    street: z.string().trim().optional(),
    city: z.string().trim().optional(),
    zip: z.string().trim().optional(),
    floor: z.string().trim().optional(),
    notes: z.string().trim().max(1000).optional(),
    terms: z.literal(true, { message: "יש לאשר את התקנון" }),
  })
  .refine(
    (value) =>
      value.fulfilment === "PICKUP" ||
      (Boolean(value.street && value.street.length > 1) &&
        Boolean(value.city && value.city.length > 1)),
    { message: "נדרשת כתובת למשלוח", path: ["street"] },
  );

export type CheckoutInput = z.input<typeof checkoutSchema>;

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
