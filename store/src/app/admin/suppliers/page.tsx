import Link from 'next/link'
import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/auth/guard'
import { PageHeader } from '@/components/admin/page-header'
import { formatDateHe } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'

export default async function AdminSuppliersPage() {
  await requireAdminPage('suppliers.view')

  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { products: true } },
      imports: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })

  return (
    <>
      <PageHeader title="ספקים" description="מידע פנימי. שם הספק אינו מוצג ללקוחות בחנות." />

      {suppliers.length === 0 ? (
        <EmptyState title="אין ספקים" />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {suppliers.map((supplier) => (
            <li key={supplier.id} className="rounded-card border border-ink-200 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-ink-900">{supplier.name}</h2>
                  <p className="text-xs text-ink-400">קוד: {supplier.code}</p>
                </div>
                <Link href={`/admin/suppliers/${supplier.id}/import`} className="text-sm font-semibold text-brand-700 hover:underline">
                  ייבוא מחירון ←
                </Link>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-ink-600">
                <div><dt className="text-ink-400">מוצרים משויכים</dt><dd className="font-semibold text-ink-900">{supplier._count.products}</dd></div>
                <div><dt className="text-ink-400">זמן אספקה</dt><dd>{supplier.leadTimeDays ? `${supplier.leadTimeDays} ימים` : 'ממתין לעדכון'}</dd></div>
                <div><dt className="text-ink-400">איש קשר</dt><dd>{supplier.contactName ?? 'ממתין לעדכון'}</dd></div>
                <div><dt className="text-ink-400">ייבוא אחרון</dt><dd>{supplier.imports[0] ? formatDateHe(supplier.imports[0].createdAt) : '—'}</dd></div>
              </dl>

              {supplier.notes && <p className="mt-3 text-xs leading-relaxed text-ink-500">{supplier.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
