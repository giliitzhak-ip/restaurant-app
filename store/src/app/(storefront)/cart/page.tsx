import type { Metadata } from 'next'
import Link from 'next/link'
import { ShoppingBag } from 'lucide-react'
import { getCart } from '@/lib/cart/service'
import { prisma } from '@/lib/db'
import { PUBLIC_PRODUCT_WHERE, productCardSelect, toCardView } from '@/lib/catalog/queries'
import { CartLines } from '@/components/storefront/cart-lines'
import { ProductCard } from '@/components/storefront/product-card'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { formatAgorot } from '@/lib/money'

export const metadata: Metadata = { title: 'עגלת קניות', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function CartPage() {
  const cart = await getCart()

  const crossSell = (
    await prisma.product.findMany({
      where: { ...PUBLIC_PRODUCT_WHERE, id: { notIn: cart.lines.map((l) => l.productId) } },
      select: productCardSelect,
      orderBy: { isBestSeller: 'desc' },
      take: 4,
    })
  ).map(toCardView)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">עגלת הקניות</h1>

      {cart.lines.length === 0 && cart.savedLines.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<ShoppingBag className="size-8" />}
          title="העגלה ריקה"
          description="אפשר להתחיל מהקטגוריות המובילות או מאשף הפתרונות."
          action={<Link href="/"><Button>חזרה לחנות</Button></Link>}
        />
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <CartLines lines={cart.lines} savedLines={cart.savedLines} />

          <aside className="lg:sticky lg:top-24 lg:h-fit">
            <div className="rounded-card border border-ink-200 bg-white p-5 shadow-soft">
              <h2 className="text-base font-bold text-ink-900">סיכום הזמנה</h2>

              {cart.totals.freeShippingThreshold > 0 && (
                <div className="mt-4">
                  <div className="h-2 overflow-hidden rounded-pill bg-ink-100">
                    <div
                      className="h-full rounded-pill bg-brand-600 transition-[width] duration-500"
                      style={{ width: `${Math.min(100, Math.round((cart.totals.subtotal / cart.totals.freeShippingThreshold) * 100))}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-ink-500">
                    {cart.totals.remainingForFreeShipping > 0
                      ? `עוד ${formatAgorot(cart.totals.remainingForFreeShipping)} למשלוח חינם`
                      : 'מזל טוב — המשלוח עלינו'}
                  </p>
                </div>
              )}

              <dl className="mt-5 space-y-2.5 text-sm">
                <div className="flex justify-between"><dt className="text-ink-500">סכום ביניים</dt><dd className="font-medium">{formatAgorot(cart.totals.subtotal)}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">הנחה</dt><dd className="font-medium">{formatAgorot(cart.totals.discount)}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">משלוח</dt><dd className="font-medium text-ink-500">מחושב בקופה</dd></div>
                <div className="flex justify-between text-xs"><dt className="text-ink-400">מתוכו מע״מ</dt><dd className="text-ink-400">{formatAgorot(cart.totals.vat)}</dd></div>
                <div className="flex justify-between border-t border-ink-100 pt-3 text-base"><dt className="font-bold">סה״כ</dt><dd className="font-bold">{formatAgorot(cart.totals.total)}</dd></div>
              </dl>

              <Link href="/checkout" className="mt-5 block">
                <Button size="lg" className="w-full" disabled={cart.lines.length === 0}>מעבר לתשלום</Button>
              </Link>
              <Link href="/" className="mt-3 block text-center text-sm font-medium text-brand-700">המשך קנייה</Link>
            </div>
          </aside>
        </div>
      )}

      {crossSell.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xl font-bold tracking-tight text-ink-900">הלקוחות מוסיפים גם</h2>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {crossSell.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
