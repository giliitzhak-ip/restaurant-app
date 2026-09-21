'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input, Textarea, Select, Field } from '@/components/ui/input'
import { agorotToShekels, shekelsToAgorot, calculateMargin, formatAgorot } from '@/lib/money'
import { PRODUCT_KIND_LABELS } from '@/lib/catalog/status'
import { updateProductAction } from '@/app/actions/products'
import type { ProductKind, UsageEnvironment, StockPolicy } from '@/generated/prisma/enums'

export interface ProductFormValues {
  name: string
  nameEn: string
  slug: string
  sku: string
  barcode: string
  brand: string
  shortDescription: string
  description: string
  benefits: string
  suitableFor: string
  keywords: string
  kind: ProductKind
  environment: UsageEnvironment
  stockPolicy: StockPolicy
  poisonFree: boolean
  readyToUse: boolean
  isBestSeller: boolean
  isNew: boolean
  costPrice: number | null
  price: number | null
  salePrice: number | null
  stock: number
  reorderPoint: number
  metaTitle: string
  metaDescription: string
  categoryIds: string[]
  primaryCategoryId: string
  supplierSku: string
}

const ENVIRONMENTS: { value: UsageEnvironment; label: string }[] = [
  { value: 'UNKNOWN', label: 'לא הוגדר' },
  { value: 'INDOOR', label: 'פנים' },
  { value: 'OUTDOOR', label: 'חוץ' },
  { value: 'BOTH', label: 'פנים וחוץ' },
]

const STOCK_POLICIES: { value: StockPolicy; label: string }[] = [
  { value: 'HIDE', label: 'הסתרה כשאין מלאי' },
  { value: 'SHOW_UNAVAILABLE', label: 'הצגה כ״אזל מהמלאי״' },
  { value: 'ALLOW_BACKORDER', label: 'אפשר הזמנה מראש' },
]

function money(value: number | null): string {
  return value === null ? '' : String(agorotToShekels(value))
}

export function ProductForm({
  productId,
  initial,
  categories,
}: {
  productId: string
  initial: ProductFormValues
  categories: { id: string; label: string }[]
}) {
  const [values, setValues] = useState(initial)
  const [costPrice, setCostPrice] = useState(money(initial.costPrice))
  const [price, setPrice] = useState(money(initial.price))
  const [salePrice, setSalePrice] = useState(money(initial.salePrice))
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const sellingAgorot = salePrice !== '' ? shekelsToAgorot(Number(salePrice)) : price !== '' ? shekelsToAgorot(Number(price)) : null
  const margin = calculateMargin(sellingAgorot, costPrice === '' ? null : shekelsToAgorot(Number(costPrice)))

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setFieldErrors({})
    startTransition(async () => {
      const result = await updateProductAction(productId, {
        ...values,
        costPrice: costPrice === '' ? null : shekelsToAgorot(Number(costPrice)),
        price: price === '' ? null : shekelsToAgorot(Number(price)),
        salePrice: salePrice === '' ? null : shekelsToAgorot(Number(salePrice)),
        stock: values.stock,
        reorderPoint: values.reorderPoint,
      })
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error ?? 'השמירה נכשלה' })
        setFieldErrors(result.fieldErrors ?? {})
        return
      }
      setMessage({ tone: 'ok', text: 'המוצר נשמר' })
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      <h2 className="text-base font-bold text-ink-900">פרטי המוצר</h2>

      {message && (
        <p role="alert" className={`rounded-xl px-4 py-2.5 text-sm font-medium ${message.tone === 'ok' ? 'bg-brand-50 text-brand-800' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="שם המוצר" htmlFor="name" error={fieldErrors.name}>
          <Input id="name" value={values.name} onChange={(e) => set('name', e.target.value)} required />
        </Field>
        <Field label="שם באנגלית" htmlFor="nameEn">
          <Input id="nameEn" dir="ltr" value={values.nameEn} onChange={(e) => set('nameEn', e.target.value)} />
        </Field>
        <Field label="כתובת URL (slug)" htmlFor="slug">
          <Input id="slug" dir="ltr" value={values.slug} onChange={(e) => set('slug', e.target.value)} />
        </Field>
        <Field label="מותג" htmlFor="brand">
          <Input id="brand" value={values.brand} onChange={(e) => set('brand', e.target.value)} />
        </Field>
        <Field label="מק״ט (SKU)" htmlFor="sku" hint="ריק = ממתין לעדכון">
          <Input id="sku" dir="ltr" value={values.sku} onChange={(e) => set('sku', e.target.value)} />
        </Field>
        <Field label="ברקוד" htmlFor="barcode" hint="ריק = ממתין לעדכון">
          <Input id="barcode" dir="ltr" value={values.barcode} onChange={(e) => set('barcode', e.target.value)} />
        </Field>
        <Field label="מק״ט ספק" htmlFor="supplierSku">
          <Input id="supplierSku" dir="ltr" value={values.supplierSku} onChange={(e) => set('supplierSku', e.target.value)} />
        </Field>
        <Field label="סוג מוצר" htmlFor="kind">
          <Select id="kind" value={values.kind} onChange={(e) => set('kind', e.target.value as ProductKind)}>
            {Object.entries(PRODUCT_KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="תיאור קצר" htmlFor="shortDescription" hint="מוצג בכרטיס המוצר ובראש דף המוצר">
        <Input id="shortDescription" value={values.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} />
      </Field>
      <Field label="תיאור מלא" htmlFor="description">
        <Textarea id="description" rows={5} value={values.description} onChange={(e) => set('description', e.target.value)} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="יתרונות" htmlFor="benefits" hint="שורה לכל יתרון">
          <Textarea id="benefits" rows={4} value={values.benefits} onChange={(e) => set('benefits', e.target.value)} />
        </Field>
        <Field label="מתאים עבור" htmlFor="suitableFor" hint="שורה לכל פריט">
          <Textarea id="suitableFor" rows={4} value={values.suitableFor} onChange={(e) => set('suitableFor', e.target.value)} />
        </Field>
        <Field label="מילות מפתח לחיפוש" htmlFor="keywords" hint="שורה לכל מילה">
          <Textarea id="keywords" rows={4} value={values.keywords} onChange={(e) => set('keywords', e.target.value)} />
        </Field>
      </div>

      <section>
        <h3 className="text-sm font-bold text-ink-900">מחירים ומלאי</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field label="מחיר עלות (₪)" htmlFor="costPrice" hint="פנימי — לא מוצג ללקוח">
            <Input id="costPrice" type="number" min={0} step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
          </Field>
          <Field label="מחיר מכירה (₪)" htmlFor="price" error={fieldErrors.price}>
            <Input id="price" type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="מחיר מבצע (₪)" htmlFor="salePrice" error={fieldErrors.salePrice}>
            <Input id="salePrice" type="number" min={0} step="0.01" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
          </Field>
        </div>

        <div className="mt-3 rounded-xl bg-ink-50 px-4 py-3 text-sm">
          <p className="font-medium text-ink-700">
            רווח גולמי: <span className="font-bold text-ink-900">{formatAgorot(margin.grossProfit)}</span>
            {margin.grossMarginPercent !== null && (
              <> · שיעור רווח גולמי: <span className="font-bold text-ink-900">{margin.grossMarginPercent}%</span></>
            )}
          </p>
          <p className="mt-0.5 text-xs text-ink-500">חישוב פנימי. מחיר העלות אינו מוצג ללקוחות בשום מקום באתר.</p>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="מלאי" htmlFor="stock">
            <Input id="stock" type="number" min={0} value={values.stock} onChange={(e) => set('stock', Number(e.target.value))} />
          </Field>
          <Field label="מינימום מלאי (נקודת הזמנה)" htmlFor="reorderPoint">
            <Input id="reorderPoint" type="number" min={0} value={values.reorderPoint} onChange={(e) => set('reorderPoint', Number(e.target.value))} />
          </Field>
          <Field label="התנהגות כשאין מלאי" htmlFor="stockPolicy">
            <Select id="stockPolicy" value={values.stockPolicy} onChange={(e) => set('stockPolicy', e.target.value as StockPolicy)}>
              {STOCK_POLICIES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </Field>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold text-ink-900">קטגוריות</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="קטגוריות משויכות" htmlFor="categoryIds" hint="ניתן לבחור כמה (Ctrl/Cmd)">
            <select
              id="categoryIds"
              multiple
              size={8}
              value={values.categoryIds}
              onChange={(e) => set('categoryIds', Array.from(e.target.selectedOptions, (o) => o.value))}
              className="w-full rounded-xl border border-ink-200 bg-white p-2 text-sm"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.label}</option>
              ))}
            </select>
          </Field>
          <Field label="קטגוריה ראשית" htmlFor="primaryCategoryId">
            <Select id="primaryCategoryId" value={values.primaryCategoryId} onChange={(e) => set('primaryCategoryId', e.target.value)}>
              <option value="">ללא</option>
              {categories
                .filter((category) => values.categoryIds.includes(category.id))
                .map((category) => (
                  <option key={category.id} value={category.id}>{category.label}</option>
                ))}
            </Select>
          </Field>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold text-ink-900">מאפיינים</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="סביבת שימוש" htmlFor="environment">
            <Select id="environment" value={values.environment} onChange={(e) => set('environment', e.target.value as UsageEnvironment)}>
              {ENVIRONMENTS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2 pt-6 text-sm">
            {([
              ['poisonFree', 'ללא רעל'],
              ['readyToUse', 'מוכן לשימוש'],
              ['isBestSeller', 'רב מכר'],
              ['isNew', 'חדש'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-ink-700">
                <input
                  type="checkbox"
                  checked={values[key]}
                  onChange={(e) => set(key, e.target.checked)}
                  className="size-4 rounded accent-brand-700"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold text-ink-900">SEO</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="כותרת Meta" htmlFor="metaTitle">
            <Input id="metaTitle" value={values.metaTitle} onChange={(e) => set('metaTitle', e.target.value)} />
          </Field>
          <Field label="תיאור Meta" htmlFor="metaDescription">
            <Input id="metaDescription" value={values.metaDescription} onChange={(e) => set('metaDescription', e.target.value)} />
          </Field>
        </div>
      </section>

      <div className="flex gap-3">
        <Button type="submit" size="lg" disabled={pending}>{pending ? 'שומר…' : 'שמירת שינויים'}</Button>
      </div>
    </form>
  )
}
