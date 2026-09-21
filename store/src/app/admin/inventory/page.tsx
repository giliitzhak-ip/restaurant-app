import Link from 'next/link'
import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/auth/guard'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/ui/badge'
import { formatDateHe } from '@/lib/utils'

export default async function AdminInventoryPage() {
  await requireAdminPage('inventory.view')

  const [items, movements] = await Promise.all([
    prisma.inventory.findMany({
      orderBy: { onHand: 'asc' },
      take: 100,
      include: { product: { select: { id: true, name: true, sku: true } } },
    }),
    prisma.inventoryMovement.findMany({
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: { product: { select: { name: true } } },
    }),
  ])

  return (
    <>
      <PageHeader title="מלאי" description="כמות במלאי, כמות משוריינת והתראות מלאי נמוך." />

      {items.length === 0 ? (
        <EmptyState title="אין רשומות מלאי" />
      ) : (
        <div className="overflow-x-auto rounded-card border border-ink-200 bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">מצב מלאי לפי מוצר</caption>
            <thead className="bg-ink-50 text-xs text-ink-600">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">מוצר</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">מק״ט</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">במלאי</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">משוריין</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">זמין</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">נקודת הזמנה</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">מצב</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {items.map((item) => {
                const available = item.onHand - item.reserved
                const low = item.onHand <= item.reorderPoint
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-3">
                      {item.product ? (
                        <Link href={`/admin/products/${item.product.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                          {item.product.name}
                        </Link>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs" dir="ltr">{item.product?.sku ?? '—'}</td>
                    <td className="px-4 py-3 font-semibold">{item.onHand}</td>
                    <td className="px-4 py-3">{item.reserved}</td>
                    <td className="px-4 py-3">{available}</td>
                    <td className="px-4 py-3">{item.reorderPoint}</td>
                    <td className="px-4 py-3">
                      {item.onHand === 0 ? <Badge tone="danger">אזל</Badge> : low ? <Badge tone="warning">מלאי נמוך</Badge> : <Badge tone="success">תקין</Badge>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-10 text-base font-bold text-ink-900">תנועות מלאי אחרונות</h2>
      <ul className="mt-4 divide-y divide-ink-100 overflow-hidden rounded-card border border-ink-200 bg-white">
        {movements.map((movement) => (
          <li key={movement.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
            <span className="text-xs text-ink-400">{formatDateHe(movement.createdAt)}</span>
            <span className="font-medium text-ink-800">{movement.product.name}</span>
            <span className="text-xs text-ink-500">{movement.type}</span>
            <span className={movement.quantity < 0 ? 'ms-auto font-semibold text-red-600' : 'ms-auto font-semibold text-brand-700'}>
              {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}
            </span>
          </li>
        ))}
        {movements.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-400">אין תנועות</li>}
      </ul>
    </>
  )
}
