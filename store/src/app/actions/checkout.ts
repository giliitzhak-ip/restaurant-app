'use server'

import { cookies } from 'next/headers'
import { checkoutSchema } from '@/lib/orders/validation'
import { placeOrder } from '@/lib/orders/service'
import { getShippingProvider } from '@/lib/shipping'
import { getCart, CART_COOKIE } from '@/lib/cart/service'
import { rateLimit } from '@/lib/auth/rate-limit'

export interface CheckoutResult {
  ok: boolean
  error?: string
  fieldErrors?: Record<string, string>
  orderNumber?: string
  redirectUrl?: string | null
}

export async function submitCheckout(formData: FormData): Promise<CheckoutResult> {
  const raw = {
    email: String(formData.get('email') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    fullName: String(formData.get('fullName') ?? ''),
    city: String(formData.get('city') ?? ''),
    street: String(formData.get('street') ?? ''),
    houseNumber: String(formData.get('houseNumber') ?? ''),
    apartment: String(formData.get('apartment') ?? '') || undefined,
    floor: String(formData.get('floor') ?? '') || undefined,
    entrance: String(formData.get('entrance') ?? '') || undefined,
    postalCode: String(formData.get('postalCode') ?? '') || undefined,
    courierNote: String(formData.get('courierNote') ?? '') || undefined,
    shippingMethod: String(formData.get('shippingMethod') ?? 'COURIER'),
    needsInvoice: formData.get('needsInvoice') === 'on',
    businessName: String(formData.get('businessName') ?? '') || undefined,
    taxId: String(formData.get('taxId') ?? '') || undefined,
    customerNote: String(formData.get('customerNote') ?? '') || undefined,
    acceptTerms: formData.get('acceptTerms') === 'on',
    marketingOptIn: formData.get('marketingOptIn') === 'on',
  }

  const parsed = checkoutSchema.safeParse(raw)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form')
      fieldErrors[key] ??= issue.message
    }
    return { ok: false, error: 'יש לתקן את השדות המסומנים', fieldErrors }
  }

  const store = await cookies()
  const cartToken = store.get(CART_COOKIE)?.value
  if (!cartToken) return { ok: false, error: 'העגלה ריקה' }

  const limit = rateLimit(`checkout:${cartToken}`, 10, 300)
  if (!limit.allowed) return { ok: false, error: 'יותר מדי ניסיונות. נסו שוב בעוד מספר דקות.' }

  const cart = await getCart()
  if (cart.lines.length === 0) return { ok: false, error: 'העגלה ריקה' }

  const data = parsed.data
  const options = await getShippingProvider().quote({ city: data.city, subtotal: cart.totals.subtotal })
  const option = options.find((o) => o.method === data.shippingMethod)
  if (!option) return { ok: false, error: 'שיטת המשלוח אינה זמינה לכתובת זו' }

  try {
    const { order, redirectUrl } = await placeOrder({
      cartToken,
      email: data.email,
      phone: data.phone,
      shippingAddress: {
        fullName: data.fullName,
        city: data.city,
        street: data.street,
        houseNumber: data.houseNumber,
        apartment: data.apartment,
        floor: data.floor,
        entrance: data.entrance,
        postalCode: data.postalCode,
        courierNote: data.courierNote,
      },
      invoiceDetails: data.needsInvoice ? { businessName: data.businessName, taxId: data.taxId } : null,
      shippingMethod: option.method,
      shippingPrice: option.price,
      customerNote: data.customerNote ?? null,
      marketingOptIn: data.marketingOptIn,
    })
    return { ok: true, orderNumber: order.orderNumber, redirectUrl }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'אירעה שגיאה בביצוע ההזמנה' }
  }
}
