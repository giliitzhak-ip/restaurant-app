import { z } from 'zod'

const ISRAELI_PHONE = /^0(5\d|[2-4]|[8-9]|7\d)-?\d{7}$/

export const checkoutSchema = z.object({
  email: z.string().email('כתובת אימייל אינה תקינה'),
  phone: z.string().trim().regex(ISRAELI_PHONE, 'מספר טלפון אינו תקין'),
  fullName: z.string().trim().min(2, 'יש להזין שם מלא'),
  city: z.string().trim().min(2, 'יש להזין עיר'),
  street: z.string().trim().min(2, 'יש להזין רחוב'),
  houseNumber: z.string().trim().min(1, 'יש להזין מספר בית'),
  apartment: z.string().trim().optional(),
  floor: z.string().trim().optional(),
  entrance: z.string().trim().optional(),
  postalCode: z.string().trim().optional(),
  courierNote: z.string().trim().max(300).optional(),
  shippingMethod: z.enum(['COURIER', 'PICKUP_POINT', 'SELF_PICKUP']),
  needsInvoice: z.boolean().default(false),
  businessName: z.string().trim().optional(),
  taxId: z.string().trim().optional(),
  customerNote: z.string().trim().max(500).optional(),
  acceptTerms: z.literal(true, { message: 'יש לאשר את תנאי השימוש' }),
  marketingOptIn: z.boolean().default(false),
}).refine((data) => !data.needsInvoice || (data.businessName && data.taxId), {
  message: 'יש להזין שם עסק ומספר ח.פ/ע.מ',
  path: ['taxId'],
})

export type CheckoutInput = z.infer<typeof checkoutSchema>
