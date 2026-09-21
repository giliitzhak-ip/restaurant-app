'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input, Field, Textarea } from '@/components/ui/input'
import { formatAgorot } from '@/lib/money'
import { submitCheckout, type CheckoutResult } from '@/app/actions/checkout'
import type { ShippingOption } from '@/lib/shipping/types'

export function CheckoutForm({ shippingOptions }: { shippingOptions: ShippingOption[] }) {
  const [result, setResult] = useState<CheckoutResult | null>(null)
  const [needsInvoice, setNeedsInvoice] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const errors = result?.fieldErrors ?? {}

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const response = await submitCheckout(formData)
      setResult(response)
      if (response.ok) {
        router.push(response.redirectUrl ?? `/checkout/thank-you/${response.orderNumber}`)
      }
    })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      {result && !result.ok && result.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{result.error}</p>
      )}

      <section>
        <h2 className="text-base font-bold text-ink-900">פרטי לקוח</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="שם מלא" htmlFor="fullName" error={errors.fullName}>
            <Input id="fullName" name="fullName" autoComplete="name" required />
          </Field>
          <Field label="טלפון" htmlFor="phone" error={errors.phone} hint="לעדכוני משלוח">
            <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required />
          </Field>
          <Field label="אימייל" htmlFor="email" error={errors.email} className="sm:col-span-2">
            <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" required />
          </Field>
        </div>
      </section>

      <section>
        <h2 className="text-base font-bold text-ink-900">כתובת למשלוח</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="עיר" htmlFor="city" error={errors.city}>
            <Input id="city" name="city" autoComplete="address-level2" required />
          </Field>
          <Field label="רחוב" htmlFor="street" error={errors.street}>
            <Input id="street" name="street" autoComplete="address-line1" required />
          </Field>
          <Field label="מספר" htmlFor="houseNumber" error={errors.houseNumber}>
            <Input id="houseNumber" name="houseNumber" inputMode="numeric" required />
          </Field>
          <Field label="דירה" htmlFor="apartment">
            <Input id="apartment" name="apartment" />
          </Field>
          <Field label="קומה" htmlFor="floor">
            <Input id="floor" name="floor" />
          </Field>
          <Field label="כניסה" htmlFor="entrance">
            <Input id="entrance" name="entrance" />
          </Field>
          <Field label="מיקוד" htmlFor="postalCode">
            <Input id="postalCode" name="postalCode" inputMode="numeric" autoComplete="postal-code" />
          </Field>
          <Field label="הערות לשליח" htmlFor="courierNote" className="sm:col-span-2">
            <Input id="courierNote" name="courierNote" />
          </Field>
        </div>
      </section>

      <section>
        <h2 className="text-base font-bold text-ink-900">שיטת משלוח</h2>
        <fieldset className="mt-4 space-y-2">
          <legend className="sr-only">בחירת שיטת משלוח</legend>
          {shippingOptions.map((option, index) => (
            <label key={option.method} className="flex cursor-pointer items-center gap-3 rounded-xl border border-ink-200 p-4 hover:border-brand-300">
              <input type="radio" name="shippingMethod" value={option.method} defaultChecked={index === 0} className="size-4 accent-brand-700" required />
              <span className="flex-1">
                <span className="block text-sm font-medium text-ink-900">{option.label}</span>
                {option.etaText && <span className="block text-xs text-ink-500">{option.etaText}</span>}
              </span>
              <span className="text-sm font-semibold">{option.price === 0 ? 'חינם' : formatAgorot(option.price)}</span>
            </label>
          ))}
          {shippingOptions.length === 0 && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              אין כרגע אפשרויות משלוח זמינות. אנא צרו קשר עם שירות הלקוחות.
            </p>
          )}
        </fieldset>
      </section>

      <section>
        <h2 className="text-base font-bold text-ink-900">חשבונית</h2>
        <label className="mt-3 flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" name="needsInvoice" checked={needsInvoice} onChange={(e) => setNeedsInvoice(e.target.checked)} className="size-4 rounded accent-brand-700" />
          נדרשת חשבונית לעוסק/חברה
        </label>
        {needsInvoice && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="שם העסק" htmlFor="businessName" error={errors.businessName}>
              <Input id="businessName" name="businessName" />
            </Field>
            <Field label="ח.פ / ע.מ" htmlFor="taxId" error={errors.taxId}>
              <Input id="taxId" name="taxId" inputMode="numeric" />
            </Field>
          </div>
        )}
      </section>

      <section>
        <Field label="הערות להזמנה" htmlFor="customerNote">
          <Textarea id="customerNote" name="customerNote" rows={3} />
        </Field>
      </section>

      <section className="space-y-3">
        <label className="flex items-start gap-2 text-sm text-ink-700">
          <input type="checkbox" name="acceptTerms" required className="mt-0.5 size-4 rounded accent-brand-700" />
          <span>
            קראתי ואני מאשר/ת את <Link href="/page/terms" className="font-medium text-brand-700 underline">תנאי השימוש</Link> ואת{' '}
            <Link href="/page/privacy-policy" className="font-medium text-brand-700 underline">מדיניות הפרטיות</Link>
          </span>
        </label>
        {errors.acceptTerms && <p role="alert" className="text-xs font-medium text-red-600">{errors.acceptTerms}</p>}
        <label className="flex items-start gap-2 text-sm text-ink-700">
          <input type="checkbox" name="marketingOptIn" className="mt-0.5 size-4 rounded accent-brand-700" />
          אני מעוניין/ת לקבל מבצעים ומדריכים במייל
        </label>
      </section>

      <Button type="submit" size="lg" className="w-full" disabled={pending || shippingOptions.length === 0}>
        {pending ? 'שולח…' : 'מעבר לתשלום מאובטח'}
      </Button>
      <p className="text-center text-xs text-ink-400">
        התשלום מתבצע בעמוד מאובטח של חברת הסליקה. פרטי האשראי אינם נשמרים באתר.
      </p>
    </form>
  )
}
