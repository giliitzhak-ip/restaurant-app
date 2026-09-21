import Link from 'next/link'
import { TrendingUp, Package, AlertTriangle, ShieldAlert, Images, Users } from 'lucide-react'
import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/auth/guard'
import { PageHeader } from '@/components/admin/page-header'
import { Card, CardBody } from '@/components/ui/card'
import { formatAgorot } from '@/lib/money'

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  await requireAdminPage('dashboard.view')
  const { denied } = await searchParams

  const [paidOrders, orderCount, productCount, publishedCount, awaitingRegulatory, lowStock, missingMedia, missingPrice, customers, demoCount] =
    await Promise.all([
      prisma.order.aggregate({ _sum: { grandTotal: true }, where: { status: { in: ['PAID', 'PROCESSING', 'PACKING', 'READY_FOR_SHIPPING', 'SHIPPED', 'DELIVERED'] } } }),
      prisma.order.count(),
      prisma.product.count(),
      prisma.product.count({ where: { published: true } }),
      prisma.regulatoryRecord.count({ where: { status: { in: ['REQUIRES_VERIFICATION', 'EXPIRED'] } } }),
      prisma.inventory.count({ where: { onHand: { lte: 5 } } }),
      prisma.product.count({ where: { media: { none: {} } } }),
      prisma.product.count({ where: { price: null } }),
      prisma.customer.count(),
      prisma.product.count({ where: { isDemoData: true } }),
    ])

  const revenue = paidOrders._sum.grandTotal ?? 0
  const averageOrder = orderCount > 0 ? Math.round(revenue / orderCount) : 0

  const stats = [
    { label: 'הכנסות (הזמנות ששולמו)', value: formatAgorot(revenue), Icon: TrendingUp },
    { label: 'הזמנות', value: String(orderCount), Icon: Package },
    { label: 'ערך הזמנה ממוצע', value: formatAgorot(averageOrder), Icon: TrendingUp },
    { label: 'מוצרים (מתוכם מפורסמים)', value: `${productCount} / ${publishedCount}`, Icon: Package },
    { label: 'לקוחות', value: String(customers), Icon: Users },
    { label: 'שיעור המרה', value: '— נדרש חיבור אנליטיקס', Icon: TrendingUp },
  ]

  const tasks = [
    { label: 'מוצרים הממתינים לאימות רגולטורי', count: awaitingRegulatory, href: '/admin/regulatory', Icon: ShieldAlert },
    { label: 'מוצרים ללא תמונה', count: missingMedia, href: '/admin/products?missing=media', Icon: Images },
    { label: 'מוצרים ללא מחיר', count: missingPrice, href: '/admin/products?missing=price', Icon: AlertTriangle },
    { label: 'מוצרים במלאי נמוך', count: lowStock, href: '/admin/inventory', Icon: AlertTriangle },
  ]

  return (
    <>
      <PageHeader title="דשבורד" description="מצב החנות במבט אחד." />

      {denied && (
        <p role="alert" className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          אין לך הרשאה לגשת לאזור המבוקש.
        </p>
      )}

      {demoCount > 0 && (
        <p className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          שימו לב: {demoCount} מוצרים במערכת מסומנים כ־DEMO DATA. יש להחליף אותם בנתוני אמת לפני עלייה לאוויר.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(({ label, value, Icon }) => (
          <Card key={label}>
            <CardBody>
              <div className="flex items-start justify-between">
                <p className="text-xs font-medium text-ink-500">{label}</p>
                <Icon className="size-4 text-ink-300" aria-hidden />
              </div>
              <p className="mt-2 text-xl font-bold text-ink-900">{value}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <h2 className="mt-10 text-base font-bold text-ink-900">משימות פתוחות</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {tasks.map(({ label, count, href, Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-3 rounded-card border border-ink-200 bg-white p-4 transition-colors hover:border-brand-300">
            <Icon className={count > 0 ? 'size-5 text-amber-600' : 'size-5 text-ink-300'} aria-hidden />
            <span className="flex-1 text-sm font-medium text-ink-800">{label}</span>
            <span className={count > 0 ? 'text-lg font-bold text-amber-700' : 'text-lg font-bold text-ink-300'}>{count}</span>
          </Link>
        ))}
      </div>
    </>
  )
}
