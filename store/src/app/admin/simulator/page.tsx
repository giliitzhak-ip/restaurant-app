import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { requireAdminPage } from '@/lib/auth/guard'
import { PageHeader } from '@/components/admin/page-header'
import { SimulatorPanel } from '@/components/admin/simulator-panel'
import { summariseSimulatedData } from '@/lib/simulator/purge'
import { simulatorEnabled } from '@/lib/simulator/engine'
import { prisma } from '@/lib/db'
import { PUBLIC_PRODUCT_WHERE } from '@/lib/catalog/queries'
import { SCENARIOS } from '@/lib/simulator/scenarios'

export default async function SimulatorPage() {
  await requireAdminPage('simulator.run')

  const [summary, sellableProducts] = await Promise.all([
    summariseSimulatedData(),
    prisma.product.count({ where: PUBLIC_PRODUCT_WHERE }),
  ])

  return (
    <>
      <PageHeader
        title="סימולטור הזמנות ותפעול"
        description="מייצר הזמנות דמה שעוברות בדיוק באותו קוד שלקוח אמיתי עובר בו — כדי לראות את הדשבורד, ההזמנות והמלאי מתמלאים, ולוודא שהחוקים עובדים."
      />

      <div className="mb-5 rounded-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="flex items-start gap-2 font-semibold">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          הסימולטור כותב נתונים אמיתיים למסד
        </p>
        <ul className="mt-2 list-disc space-y-1 ps-6 text-xs leading-relaxed">
          <li>כל הזמנה שנוצרת מסומנת <code>isSimulated</code> וניתן למחוק את כולן בלחיצה אחת.</li>
          <li>הסימולציה משנה מלאי בפועל — מחיקת הנתונים מחזירה את המלאי למצבו.</li>
          <li>בסביבת Production הסימולטור מושבת אלא אם הוגדר <code dir="ltr">ENABLE_SIMULATOR=true</code>.</li>
          <li>לא נשלחים מיילים ללקוחות בזמן סימולציה, והזהויות שנוצרות סינתטיות לחלוטין.</li>
        </ul>
      </div>

      {!simulatorEnabled() && (
        <p role="alert" className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          הסימולטור מושבת בסביבה זו.
        </p>
      )}

      {sellableProducts === 0 && (
        <p role="alert" className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          אין מוצרים מפורסמים עם מחיר, ולכן אי אפשר לייצר הזמנות.{' '}
          <Link href="/admin/products" className="underline">לפרסום מוצר</Link>
        </p>
      )}

      <SimulatorPanel
        enabled={simulatorEnabled() && sellableProducts > 0}
        scenarios={SCENARIOS}
        summary={summary}
        sellableProducts={sellableProducts}
      />
    </>
  )
}
