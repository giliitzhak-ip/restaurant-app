import Link from 'next/link'
import type { Metadata } from 'next'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = { title: 'סביבת סליקה לבדיקה', robots: { index: false, follow: false } }

/**
 * Stand-in for the payment gateway's hosted page while no provider is
 * contracted. It never collects card details — it only explains the state.
 */
export default async function SandboxPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; order?: string }>
}) {
  const { ref, order } = await searchParams

  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <div className="rounded-card border border-amber-200 bg-amber-50 p-6">
        <h1 className="flex items-center gap-2 text-lg font-bold text-ink-900">
          <AlertTriangle className="size-5 text-amber-600" aria-hidden />
          סביבת סליקה לבדיקה (Sandbox)
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-700">
          לא חובר ספק סליקה. בסביבת הייצור, בשלב זה הלקוח מועבר לעמוד מאובטח של חברת הסליקה
          ומזין שם את פרטי התשלום. האתר אינו מקבל ואינו שומר מספרי כרטיס או CVV בשום שלב.
        </p>
        <dl className="mt-4 space-y-1 text-xs text-ink-600">
          <div className="flex gap-2"><dt className="font-semibold">מזהה תשלום:</dt><dd>{ref ?? '—'}</dd></div>
          <div className="flex gap-2"><dt className="font-semibold">מספר הזמנה:</dt><dd>{order ?? '—'}</dd></div>
        </dl>
        {order && (
          <Link href={`/checkout/thank-you/${order}`} className="mt-6 inline-block">
            <Button>המשך לאישור ההזמנה</Button>
          </Link>
        )}
      </div>
    </div>
  )
}
