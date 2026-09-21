import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/auth/guard'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { formatAgorot } from '@/lib/money'
import { formatDateHe } from '@/lib/utils'

export default async function AdminCustomersPage() {
  await requireAdminPage('customers.view')

  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      orders: { select: { grandTotal: true, status: true } },
      _count: { select: { orders: true } },
    },
  })

  return (
    <>
      <PageHeader title="לקוחות" description="נשמר רק המידע הדרוש לביצוע ההזמנה ולשירות." />

      {customers.length === 0 ? (
        <EmptyState title="אין לקוחות" />
      ) : (
        <div className="overflow-x-auto rounded-card border border-ink-200 bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">רשימת לקוחות</caption>
            <thead className="bg-ink-50 text-xs text-ink-600">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">אימייל</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">טלפון</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">הזמנות</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">סה״כ רכישות</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">ממוצע</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">דיוור</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">נוצר</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {customers.map((customer) => {
                const paid = customer.orders.filter((o) => o.status !== 'CANCELLED')
                const total = paid.reduce((sum, o) => sum + o.grandTotal, 0)
                const average = paid.length > 0 ? Math.round(total / paid.length) : 0
                return (
                  <tr key={customer.id}>
                    <td className="px-4 py-3" dir="ltr">{customer.email}</td>
                    <td className="px-4 py-3 text-xs" dir="ltr">{customer.phone ?? '—'}</td>
                    <td className="px-4 py-3">{customer._count.orders}</td>
                    <td className="px-4 py-3 font-semibold">{formatAgorot(total)}</td>
                    <td className="px-4 py-3">{formatAgorot(average)}</td>
                    <td className="px-4 py-3 text-xs">{customer.marketingOptIn ? 'מאושר' : '—'}</td>
                    <td className="px-4 py-3 text-xs text-ink-400">{formatDateHe(customer.createdAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
