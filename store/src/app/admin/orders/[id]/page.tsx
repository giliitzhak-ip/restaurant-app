import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/auth/guard'
import { PageHeader } from '@/components/admin/page-header'
import { Badge } from '@/components/ui/badge'
import { formatAgorot } from '@/lib/money'
import { formatDateHe } from '@/lib/utils'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONE, PAYMENT_STATUS_LABELS, SHIPMENT_STATUS_LABELS } from '@/lib/orders/status'
import { OrderControls } from '@/components/admin/order-controls'

interface ShippingAddress {
  fullName?: string
  city?: string
  street?: string
  houseNumber?: string
  apartment?: string
  floor?: string
  entrance?: string
  postalCode?: string
  courierNote?: string
}

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage('orders.view')
  const { id } = await params

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: true,
      payments: true,
      refunds: true,
      shipments: true,
      events: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!order) notFound()

  const address = (order.shippingAddress ?? {}) as ShippingAddress

  return (
    <>
      <PageHeader
        title={`הזמנה ${order.orderNumber}`}
        description={formatDateHe(order.createdAt)}
        action={<Badge tone={ORDER_STATUS_TONE[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Badge>}
      />
      <Link href="/admin/orders" className="mb-5 inline-block text-sm font-medium text-brand-700 hover:underline">← חזרה להזמנות</Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="rounded-card border border-ink-200 bg-white p-5">
            <h2 className="text-sm font-bold text-ink-900">פריטים</h2>
            <table className="mt-3 w-full text-sm">
              <caption className="sr-only">פריטי ההזמנה</caption>
              <thead className="text-xs text-ink-500">
                <tr>
                  <th scope="col" className="pb-2 text-start font-semibold">מוצר</th>
                  <th scope="col" className="pb-2 text-start font-semibold">מק״ט</th>
                  <th scope="col" className="pb-2 text-start font-semibold">כמות</th>
                  <th scope="col" className="pb-2 text-start font-semibold">סה״כ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2.5">{item.name}</td>
                    <td className="py-2.5 text-xs text-ink-500" dir="ltr">{item.sku ?? '—'}</td>
                    <td className="py-2.5">{item.quantity}</td>
                    <td className="py-2.5 font-semibold">{formatAgorot(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <dl className="mt-4 space-y-1.5 border-t border-ink-100 pt-4 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">סכום ביניים</dt><dd>{formatAgorot(order.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">הנחה</dt><dd>{formatAgorot(order.discountTotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">משלוח</dt><dd>{formatAgorot(order.shippingTotal)}</dd></div>
              <div className="flex justify-between text-xs"><dt className="text-ink-400">מתוכו מע״מ</dt><dd className="text-ink-400">{formatAgorot(order.vatTotal)}</dd></div>
              <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-bold"><dt>סה״כ</dt><dd>{formatAgorot(order.grandTotal)}</dd></div>
            </dl>
          </section>

          <section className="rounded-card border border-ink-200 bg-white p-5">
            <h2 className="text-sm font-bold text-ink-900">ציר זמן</h2>
            <ol className="mt-3 space-y-2.5">
              {order.events.map((event) => (
                <li key={event.id} className="flex gap-3 text-sm">
                  <span className="shrink-0 text-xs text-ink-400">{formatDateHe(event.createdAt)}</span>
                  <span className="text-ink-700">{event.message}</span>
                </li>
              ))}
            </ol>
          </section>

          <OrderControls
            orderId={order.id}
            status={order.status}
            adminNote={order.adminNote ?? ''}
            grandTotal={order.grandTotal}
            refundedTotal={order.refunds.reduce((sum, r) => sum + r.amount, 0)}
          />
        </div>

        <aside className="space-y-4">
          <section className="rounded-card border border-ink-200 bg-white p-5">
            <h2 className="text-sm font-bold text-ink-900">לקוח</h2>
            <dl className="mt-2 space-y-1 text-sm text-ink-700">
              <div><dt className="sr-only">אימייל</dt><dd dir="ltr">{order.email}</dd></div>
              <div><dt className="sr-only">טלפון</dt><dd dir="ltr">{order.phone}</dd></div>
            </dl>
          </section>

          <section className="rounded-card border border-ink-200 bg-white p-5">
            <h2 className="text-sm font-bold text-ink-900">כתובת למשלוח</h2>
            <address className="mt-2 text-sm not-italic text-ink-700">
              {address.fullName}<br />
              {address.street} {address.houseNumber}
              {address.apartment ? `, דירה ${address.apartment}` : ''}
              {address.floor ? `, קומה ${address.floor}` : ''}<br />
              {address.city} {address.postalCode ?? ''}
            </address>
            {address.courierNote && <p className="mt-2 text-xs text-ink-500">הערה לשליח: {address.courierNote}</p>}
          </section>

          <section className="rounded-card border border-ink-200 bg-white p-5">
            <h2 className="text-sm font-bold text-ink-900">תשלום</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-ink-700">
              {order.payments.map((payment) => (
                <li key={payment.id}>
                  {PAYMENT_STATUS_LABELS[payment.status]} · {formatAgorot(payment.amount)}
                  <span className="block text-xs text-ink-400">ספק: {payment.provider}</span>
                </li>
              ))}
              {order.payments.length === 0 && <li className="text-ink-400">אין רשומות תשלום</li>}
            </ul>
          </section>

          <section className="rounded-card border border-ink-200 bg-white p-5">
            <h2 className="text-sm font-bold text-ink-900">משלוח</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-ink-700">
              {order.shipments.map((shipment) => (
                <li key={shipment.id}>
                  {SHIPMENT_STATUS_LABELS[shipment.status]} · {shipment.method}
                  {shipment.trackingCode && <span className="block text-xs text-ink-400" dir="ltr">{shipment.trackingCode}</span>}
                </li>
              ))}
              {order.shipments.length === 0 && <li className="text-ink-400">אין משלוחים</li>}
            </ul>
          </section>
        </aside>
      </div>
    </>
  )
}
