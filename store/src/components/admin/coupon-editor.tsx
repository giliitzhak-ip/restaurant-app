'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input, Select, Field } from '@/components/ui/input'
import { upsertCouponAction } from '@/app/actions/admin-misc'

export function CouponEditor() {
  const [code, setCode] = useState('')
  const [type, setType] = useState<'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING'>('PERCENTAGE')
  const [value, setValue] = useState('10')
  const [minBasket, setMinBasket] = useState('')
  const [usageLimit, setUsageLimit] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <form
      className="grid gap-3 sm:grid-cols-5"
      onSubmit={(event) => {
        event.preventDefault()
        setMessage(null)
        startTransition(async () => {
          const result = await upsertCouponAction(null, {
            code,
            type,
            // Percentage is whole percent; fixed amounts are entered in shekels.
            value: type === 'PERCENTAGE' ? Number(value) : Math.round(Number(value) * 100),
            minBasket: minBasket === '' ? undefined : Math.round(Number(minBasket) * 100),
            usageLimit: usageLimit === '' ? undefined : Number(usageLimit),
            isActive: true,
          })
          setMessage(result.ok ? 'הקופון נוצר' : result.error ?? 'היצירה נכשלה')
          if (result.ok) {
            setCode('')
            router.refresh()
          }
        })
      }}
    >
      <Field label="קוד" htmlFor="coupon-code">
        <Input id="coupon-code" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} required />
      </Field>
      <Field label="סוג" htmlFor="coupon-type">
        <Select id="coupon-type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="PERCENTAGE">אחוזים</option>
          <option value="FIXED">סכום קבוע</option>
          <option value="FREE_SHIPPING">משלוח חינם</option>
        </Select>
      </Field>
      <Field label={type === 'PERCENTAGE' ? 'ערך (%)' : 'ערך (₪)'} htmlFor="coupon-value">
        <Input id="coupon-value" type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <Field label="סל מינימלי (₪)" htmlFor="coupon-min">
        <Input id="coupon-min" type="number" min={0} value={minBasket} onChange={(e) => setMinBasket(e.target.value)} />
      </Field>
      <Field label="מגבלת שימושים" htmlFor="coupon-limit">
        <Input id="coupon-limit" type="number" min={0} value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} />
      </Field>

      <div className="sm:col-span-5">
        <Button type="submit" disabled={pending}>{pending ? 'יוצר…' : 'יצירת קופון'}</Button>
        {message && <span className="ms-3 text-sm text-ink-600">{message}</span>}
      </div>
    </form>
  )
}
