import { z } from "zod";

/**
 * Checkout validation, shared by the client form and the server action.
 *
 * It lives here rather than in the action module because a `"use server"` file
 * may only export async functions — importing a schema from one leaves the
 * client with a stub.
 */
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
    /**
     * Per-submission nonce. The form mints one when it mounts and keeps it for
     * retries, so a double-clicked button or a flaky connection resolves to a
     * single order instead of two charges.
     */
    idempotencyKey: z.string().trim().max(64).optional(),
  })
  .refine(
    (value) =>
      value.fulfilment === "PICKUP" ||
      (Boolean(value.street && value.street.length > 1) &&
        Boolean(value.city && value.city.length > 1)),
    { message: "נדרשת כתובת למשלוח", path: ["street"] },
  );

export type CheckoutInput = z.input<typeof checkoutSchema>;
