import Link from 'next/link'
import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/auth/guard'
import { PageHeader } from '@/components/admin/page-header'
import { RegulatoryStatusBadge, ProductStatusBadge } from '@/components/admin/status-badge'
import { REGULATORY_STATUS_LABELS } from '@/lib/catalog/status'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDateHe } from '@/lib/utils'
import type { RegulatoryStatus } from '@/generated/prisma/enums'

const BUCKETS: { key: RegulatoryStatus | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'הכל' },
  { key: 'REQUIRES_VERIFICATION', label: 'ממתין לאימות' },
  { key: 'VERIFIED_PUBLIC_USE', label: 'מאומת' },
  { key: 'EXPIRED', label: 'אימות פג תוקף' },
  { key: 'BLOCKED', label: 'חסום' },
  { key: 'PROFESSIONAL_ONLY', label: 'לאנשי מקצוע בלבד' },
]

export default async function RegulatoryPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminPage('regulatory.view')
  const { status } = await searchParams
  const active = status ?? 'REQUIRES_VERIFICATION'

  const records = await prisma.regulatoryRecord.findMany({
    where: active === 'ALL' ? {} : { status: active as RegulatoryStatus },
    orderBy: { updatedAt: 'desc' },
    include: { product: { select: { id: true, name: true, brand: true, status: true, published: true, kind: true } } },
  })

  const counts = await prisma.regulatoryRecord.groupBy({ by: ['status'], _count: true })
  const countFor = (key: string) =>
    key === 'ALL' ? counts.reduce((s, r) => s + r._count, 0) : counts.find((r) => r.status === key)?._count ?? 0

  return (
    <>
      <PageHeader
        title="רגולציה"
        description="מוצר מתפרסם בחנות רק לאחר אימות מלא. האכיפה מתבצעת בשרת ולא רק בממשק."
      />

      <nav aria-label="סינון לפי סטטוס רגולטורי" className="mb-5 flex flex-wrap gap-1.5">
        {BUCKETS.map((bucket) => {
          const isActive = active === bucket.key
          return (
            <Link
              key={bucket.key}
              href={`/admin/regulatory?status=${bucket.key}`}
              aria-current={isActive ? 'page' : undefined}
              className={
                isActive
                  ? 'rounded-pill bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white'
                  : 'rounded-pill border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-100'
              }
            >
              {bucket.label} ({countFor(bucket.key)})
            </Link>
          )
        })}
      </nav>

      {records.length === 0 ? (
        <EmptyState title="אין רשומות בקטגוריה זו" />
      ) : (
        <div className="overflow-hidden rounded-card border border-ink-200 bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">רשומות רגולטוריות לפי {REGULATORY_STATUS_LABELS[active as RegulatoryStatus] ?? 'הכל'}</caption>
            <thead className="bg-ink-50 text-xs text-ink-600">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">מוצר</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">סטטוס רגולטורי</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">מספר רישום</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">מקור המידע</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">אומת בתאריך</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">תווית</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">סטטוס מוצר</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {records.map((record) => (
                <tr key={record.id}>
                  <td className="px-4 py-3">
                    <Link href={`/admin/regulatory/${record.productId}`} className="font-medium text-ink-900 hover:text-brand-700">
                      {record.product.name}
                    </Link>
                    {record.product.brand && <span className="block text-xs text-ink-400">{record.product.brand}</span>}
                  </td>
                  <td className="px-4 py-3"><RegulatoryStatusBadge status={record.status} /></td>
                  <td className="px-4 py-3 text-xs">{record.registrationNumber ?? <span className="text-ink-400">ממתין לעדכון</span>}</td>
                  <td className="px-4 py-3 text-xs">{record.sourceOfInformation ?? <span className="text-ink-400">ממתין לעדכון</span>}</td>
                  <td className="px-4 py-3 text-xs">{record.labelVerifiedAt ? formatDateHe(record.labelVerifiedAt) : <span className="text-ink-400">—</span>}</td>
                  <td className="px-4 py-3 text-xs">
                    {record.labelUrl ? (
                      <a href={record.labelUrl} target="_blank" rel="noreferrer noopener" className="text-brand-700 underline">קישור</a>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3"><ProductStatusBadge status={record.product.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
