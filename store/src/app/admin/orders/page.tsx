import Link from 'next/link'
import { prisma } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'
import { requireAdminPage } from '@/lib/auth/guard'
import { PageHeader } from '@/components/admin/page-header'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatAgorot } from '@/lib/money'
import { formatDateHe } from '@/lib/utils'
import { FlaskConical } from 'lucide-react'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONE } from '@/lib/orders/status'
import type { OrderStatus } from '@/generated/prisma/enums'

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; simulated?: string }>
}) {
  await requireAdminPage('orders.view')
  const { status, q, simulated } = await searchParams

  const where: Prisma.OrderWhereInput = {}
  if (status && status !== 'ALL') where.status = status as OrderStatus
  if (simulated === '1') where.isSimulated = true
  if (simulated === '0') where.isSimulated = false
  if (q) {
    where.OR = [
      { orderNumber: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q } },
    ]
  }

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { _count: { select: { items: true } } },
  })

  const simulatedCount = await prisma.order.count({ where: { isSimulated: true } })

  return (
    <>
      <PageHeader title="הזמנות" description="מעקב, עדכון סטטוס והפקת תעודת משלוח." />

      {simulatedCount > 0 && (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <FlaskConical className="size-4 shrink-0" aria-hidden />
          {simulatedCount} מההזמנות נוצרו בסימולטור.
          <Link href={`/admin/orders?simulated=${simulated === '1' ? '0' : '1'}`} className="font-semibold underline">
            {simulated === '1' ? 'הצגת הזמנות אמיתיות בלבד' : 'הצגת הזמנות סימולציה בלבד'}
          </Link>
          <Link href="/admin/orders" className="font-semibold underline">הצגת הכול</Link>
        </p>
      )}

      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <label htmlFor="order-search" className="sr-only">חיפוש הזמנה</label>
        <input id="order-search" name="q" defaultValue={q ?? ''} placeholder="מספר הזמנה, אימייל או טלפון" className="h-10 w-full max-w-xs rounded-xl border border-ink-200 px-3 text-sm" />
        <button type="submit" className="h-10 rounded-xl bg-ink-900 px-4 text-sm font-medium text-white">חיפוש</button>
      </form>

      <nav aria-label="סינון לפי סטטוס" className="mb-5 flex flex-wrap gap-1.5">
        {(['ALL', ...Object.keys(ORDER_STATUS_LABELS)] as string[]).map((key) => {
          const active = (status ?? 'ALL') === key
          return (
            <Link
              key={key}
              href={`/admin/orders?status=${key}`}
              aria-current={active ? 'page' : undefined}
              className={active
                ? 'rounded-pill bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white'
                : 'rounded-pill border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-100'}
            >
              {key === 'ALL' ? 'הכל' : ORDER_STATUS_LABELS[key as OrderStatus]}
            </Link>
          )
        })}
      </nav>

      {orders.length === 0 ? (
        <EmptyState title="אין הזמנות" description="הזמנות שיתקבלו בחנות יופיעו כאן." />
      ) : (
        <div className="overflow-x-auto rounded-card border border-ink-200 bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">רשימת הזמנות</caption>
            <thead className="bg-ink-50 text-xs text-ink-600">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">מספר</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">תאריך</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">לקוח</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">פריטים</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">סכום</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">סטטוס</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-3">
                    <Link href={`/admin/orders/${order.id}`} className="font-medium text-ink-900 hover:text-brand-700">{order.orderNumber}</Link>
                    {order.isSimulated && <span className="ms-1.5"><Badge tone="warning">סימולציה</Badge></span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-500">{formatDateHe(order.createdAt)}</td>
                  <td className="px-4 py-3 text-xs">{order.email}</td>
                  <td className="px-4 py-3 text-xs">{order._count.items}</td>
                  <td className="px-4 py-3 font-semibold">{formatAgorot(order.grandTotal)}</td>
                  <td className="px-4 py-3"><Badge tone={ORDER_STATUS_TONE[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
