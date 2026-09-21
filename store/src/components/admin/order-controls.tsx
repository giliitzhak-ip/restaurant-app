'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea, Input, Field } from '@/components/ui/input'
import { ORDER_STATUS_LABELS, ORDER_TRANSITIONS } from '@/lib/orders/status'
import { formatAgorot, shekelsToAgorot } from '@/lib/money'
import { addOrderNoteAction, refundOrderAction, updateOrderStatusAction } from '@/app/actions/orders'
import type { OrderStatus } from '@/generated/prisma/enums'

export function OrderControls({
  orderId,
  status,
  adminNote,
  grandTotal,
  refundedTotal,
}: {
  orderId: string
  status: OrderStatus
  adminNote: string
  grandTotal: number
  refundedTotal: number
}) {
  const [note, setNote] = useState(adminNote)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState('')
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setMessage(null)
    startTransition(async () => {
      const result = await fn()
      setMessage(result.ok ? { tone: 'ok', text: success } : { tone: 'error', text: result.error ?? 'הפעולה נכשלה' })
      if (result.ok) router.refresh()
    })
  }

  const transitions = ORDER_TRANSITIONS[status] ?? []
  const remaining = grandTotal - refundedTotal

  return (
    <section className="rounded-card border border-ink-200 bg-white p-5">
      <h2 className="text-sm font-bold text-ink-900">פעולות</h2>

      {message && (
        <p role="alert" className={`mt-3 rounded-xl px-3 py-2 text-sm font-medium ${message.tone === 'ok' ? 'bg-brand-50 text-brand-800' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {transitions.map((target) => (
          <Button key={target} size="sm" variant="outline" disabled={pending} onClick={() => run(() => updateOrderStatusAction(orderId, target), 'הסטטוס עודכן')}>
            {ORDER_STATUS_LABELS[target]}
          </Button>
        ))}
        {transitions.length === 0 && <p className="text-sm text-ink-400">אין מעברי סטטוס זמינים.</p>}
      </div>

      <div className="mt-6">
        <Field label="הערת מנהל" htmlFor="adminNote">
          <Textarea id="adminNote" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Button size="sm" className="mt-2" disabled={pending} onClick={() => run(() => addOrderNoteAction(orderId, note), 'ההערה נשמרה')}>
          שמירת הערה
        </Button>
      </div>

      {remaining > 0 && (
        <div className="mt-6 border-t border-ink-100 pt-5">
          <h3 className="text-sm font-bold text-ink-900">זיכוי</h3>
          <p className="mt-1 text-xs text-ink-500">ניתן לזכות עד {formatAgorot(remaining)}.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="סכום (₪)" htmlFor="refundAmount">
              <Input id="refundAmount" type="number" min={0} step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
            </Field>
            <Field label="סיבה" htmlFor="refundReason">
              <Input id="refundReason" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
            </Field>
          </div>
          <Button
            size="sm"
            variant="danger"
            className="mt-3"
            disabled={pending || refundAmount === ''}
            onClick={() => run(() => refundOrderAction(orderId, shekelsToAgorot(Number(refundAmount)), refundReason), 'הזיכוי בוצע')}
          >
            ביצוע זיכוי
          </Button>
        </div>
      )}
    </section>
  )
}
