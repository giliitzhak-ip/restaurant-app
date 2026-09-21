import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { prisma } from '@/lib/db'
import { formatAgorot } from '@/lib/money'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = { title: 'ההזמנה התקבלה', robots: { index: false, follow: false } }

export default async function ThankYouPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { items: true },
  })
  if (!order) notFound()

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
      <CheckCircle2 className="mx-auto size-14 text-brand-600" aria-hidden />
      <h1 className="mt-5 text-2xl font-bold tracking-tight text-ink-900">תודה, ההזמנה התקבלה</h1>
      <p className="mt-2 text-sm text-ink-500">מספר הזמנה {order.orderNumber}. אישור נשלח לכתובת {order.email}.</p>

      <div className="mt-8 rounded-card border border-ink-200 bg-white p-5 text-start">
        <ul className="space-y-3">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between text-sm">
              <span className="text-ink-700">{item.name} × {item.quantity}</span>
              <span className="font-medium">{formatAgorot(item.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between border-t border-ink-100 pt-4 text-base font-bold">
          <span>סה״כ</span>
          <span>{formatAgorot(order.grandTotal)}</span>
        </div>
      </div>

      <Link href="/" className="mt-8 inline-block">
        <Button size="lg">חזרה לחנות</Button>
      </Link>
    </div>
  )
}
