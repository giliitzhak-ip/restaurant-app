import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/auth/guard'
import { PageHeader } from '@/components/admin/page-header'
import { CouponEditor } from '@/components/admin/coupon-editor'
import { formatAgorot } from '@/lib/money'
import { Badge } from '@/components/ui/badge'

export default async function AdminCouponsPage() {
  await requireAdminPage('promotions.manage')
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } })

  return (
    <>
      <PageHeader title="קופונים" description="הנחות באחוזים, בסכום קבוע או משלוח חינם." />

      <div className="mb-6 rounded-card border border-ink-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-bold text-ink-900">יצירת קופון</h2>
        <CouponEditor />
      </div>

      {coupons.length > 0 && (
        <div className="overflow-x-auto rounded-card border border-ink-200 bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">קופונים קיימים</caption>
            <thead className="bg-ink-50 text-xs text-ink-600">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">קוד</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">סוג</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">ערך</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">סל מינימלי</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">שימושים</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">מצב</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {coupons.map((coupon) => (
                <tr key={coupon.id}>
                  <td className="px-4 py-3 font-medium" dir="ltr">{coupon.code}</td>
                  <td className="px-4 py-3 text-xs">{coupon.type}</td>
                  <td className="px-4 py-3">{coupon.type === 'PERCENTAGE' ? `${coupon.value}%` : formatAgorot(coupon.value)}</td>
                  <td className="px-4 py-3 text-xs">{coupon.minBasket ? formatAgorot(coupon.minBasket) : '—'}</td>
                  <td className="px-4 py-3 text-xs">{coupon.usageCount}{coupon.usageLimit ? ` / ${coupon.usageLimit}` : ''}</td>
                  <td className="px-4 py-3"><Badge tone={coupon.isActive ? 'success' : 'neutral'}>{coupon.isActive ? 'פעיל' : 'כבוי'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
