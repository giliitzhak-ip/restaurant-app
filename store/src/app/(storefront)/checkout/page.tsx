import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCart } from '@/lib/cart/service'
import { getShippingProvider } from '@/lib/shipping'
import { CheckoutForm } from '@/components/storefront/checkout-form'
import { formatAgorot } from '@/lib/money'

export const metadata: Metadata = { title: 'תשלום', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function CheckoutPage() {
  const cart = await getCart()
  if (cart.lines.length === 0) redirect('/cart')

  const options = await getShippingProvider().quote({ city: '', subtotal: cart.totals.subtotal })

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">תשלום</h1>
      <p className="mt-1 text-sm text-ink-500">אפשר להשלים את ההזמנה ללא הרשמה.</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
        <CheckoutForm shippingOptions={options} />

        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <div className="rounded-card border border-ink-200 bg-white p-5 shadow-soft">
            <h2 className="text-base font-bold text-ink-900">סיכום ההזמנה</h2>
            <ul className="mt-4 space-y-3">
              {cart.lines.map((line) => (
                <li key={line.id} className="flex justify-between gap-3 text-sm">
                  <span className="text-ink-700">
                    {line.name}
                    <span className="text-ink-400"> × {line.quantity}</span>
                  </span>
                  <span className="shrink-0 font-medium">{formatAgorot(line.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-5 space-y-2 border-t border-ink-100 pt-4 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">סכום ביניים</dt><dd>{formatAgorot(cart.totals.subtotal)}</dd></div>
              <div className="flex justify-between text-xs"><dt className="text-ink-400">מתוכו מע״מ</dt><dd className="text-ink-400">{formatAgorot(cart.totals.vat)}</dd></div>
            </dl>
            <Link href="/cart" className="mt-4 block text-center text-sm font-medium text-brand-700">חזרה לעגלה</Link>
          </div>
        </aside>
      </div>
    </div>
  )
}
