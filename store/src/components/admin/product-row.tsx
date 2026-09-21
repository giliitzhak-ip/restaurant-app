'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ImageIcon, Pencil, Check, X } from 'lucide-react'
import type { ProductStatus, RegulatoryStatus } from '@/generated/prisma/enums'
import { ProductStatusBadge, RegulatoryStatusBadge, DemoBadge } from '@/components/admin/status-badge'
import { formatAgorot, calculateMargin, agorotToShekels, shekelsToAgorot } from '@/lib/money'
import { PRODUCT_STATUS_LABELS } from '@/lib/catalog/status'
import { quickEditProductAction, changeProductStatusAction } from '@/app/actions/products'

export interface AdminProductRow {
  id: string
  name: string
  slug: string
  sku: string | null
  brand: string | null
  price: number | null
  salePrice: number | null
  costPrice: number | null
  status: ProductStatus
  published: boolean
  isDemoData: boolean
  regulatoryStatus: RegulatoryStatus | null
  stock: number | null
  mediaCount: number
  thumbnailUrl: string | null
}

const STATUSES: ProductStatus[] = ['DRAFT', 'READY_FOR_REVIEW', 'REQUIRES_VERIFICATION', 'READY_TO_PUBLISH', 'PUBLISHED', 'ARCHIVED']

function toShekelInput(value: number | null): string {
  return value === null ? '' : String(agorotToShekels(value))
}

export function ProductRow({ product }: { product: AdminProductRow }) {
  const [editing, setEditing] = useState(false)
  const [price, setPrice] = useState(toShekelInput(product.price))
  const [salePrice, setSalePrice] = useState(toShekelInput(product.salePrice))
  const [stock, setStock] = useState(product.stock === null ? '' : String(product.stock))
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string; blockers?: string[] } | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const margin = calculateMargin(product.salePrice ?? product.price, product.costPrice)

  function save() {
    setMessage(null)
    startTransition(async () => {
      const result = await quickEditProductAction({
        productId: product.id,
        price: price === '' ? null : shekelsToAgorot(Number(price)),
        salePrice: salePrice === '' ? null : shekelsToAgorot(Number(salePrice)),
        stock: stock === '' ? null : Number(stock),
      })
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error ?? 'העדכון נכשל' })
        return
      }
      setEditing(false)
      router.refresh()
    })
  }

  function changeStatus(next: string) {
    setMessage(null)
    startTransition(async () => {
      const result = await changeProductStatusAction(product.id, next)
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error ?? 'שינוי הסטטוס נכשל', blockers: result.blockers })
        return
      }
      router.refresh()
    })
  }

  return (
    <li className={`p-3 sm:p-4 ${pending ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start gap-3">
        <Link
          href={`/admin/products/${product.id}`}
          className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-ink-200 bg-white"
          aria-label={`עריכת ${product.name}`}
        >
          {product.thumbnailUrl ? (
            <Image src={product.thumbnailUrl} alt="" fill sizes="56px" className="product-image" />
          ) : (
            <span className="flex h-full items-center justify-center text-ink-300"><ImageIcon className="size-5" aria-hidden /></span>
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href={`/admin/products/${product.id}`} className="text-sm font-semibold text-ink-900 hover:text-brand-700">
              {product.name}
            </Link>
            <ProductStatusBadge status={product.status} />
            {product.regulatoryStatus && <RegulatoryStatusBadge status={product.regulatoryStatus} />}
            {product.isDemoData && <DemoBadge />}
            {product.mediaCount === 0 && (
              <span className="rounded-pill bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">אין תמונה</span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-ink-500">
            {product.sku ?? 'מק״ט: ממתין לעדכון'}
            {product.brand ? ` · ${product.brand}` : ''}
          </p>
        </div>

        {/* Quick edit */}
        {editing ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] font-medium text-ink-600">
              מחיר ₪
              <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min={0} step="0.01" className="mt-0.5 block h-9 w-24 rounded-lg border border-ink-200 px-2 text-sm" />
            </label>
            <label className="text-[11px] font-medium text-ink-600">
              מבצע ₪
              <input value={salePrice} onChange={(e) => setSalePrice(e.target.value)} type="number" min={0} step="0.01" className="mt-0.5 block h-9 w-24 rounded-lg border border-ink-200 px-2 text-sm" />
            </label>
            <label className="text-[11px] font-medium text-ink-600">
              מלאי
              <input value={stock} onChange={(e) => setStock(e.target.value)} type="number" min={0} className="mt-0.5 block h-9 w-20 rounded-lg border border-ink-200 px-2 text-sm" />
            </label>
            <button type="button" onClick={save} disabled={pending} className="flex h-9 items-center gap-1 rounded-lg bg-brand-700 px-3 text-xs font-semibold text-white">
              <Check className="size-3.5" aria-hidden />שמירה
            </button>
            <button type="button" onClick={() => setEditing(false)} className="flex h-9 items-center gap-1 rounded-lg border border-ink-200 px-3 text-xs font-medium">
              <X className="size-3.5" aria-hidden />ביטול
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-end">
              <p className="text-sm font-bold text-ink-900">
                {product.price === null ? <span className="text-amber-700">מחיר יעודכן בקרוב</span> : formatAgorot(product.salePrice ?? product.price)}
              </p>
              {margin.grossMarginPercent !== null && (
                <p className="text-[11px] text-ink-500">
                  רווח {formatAgorot(margin.grossProfit)} · {margin.grossMarginPercent}%
                </p>
              )}
            </div>
            <p className="w-16 text-center text-xs text-ink-600">
              מלאי<br />
              <span className="font-semibold text-ink-900">{product.stock ?? '—'}</span>
            </p>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex h-9 items-center gap-1 rounded-lg border border-ink-200 px-3 text-xs font-medium hover:bg-ink-50"
            >
              <Pencil className="size-3.5" aria-hidden />עריכה מהירה
            </button>
          </div>
        )}

        <div>
          <label htmlFor={`status-${product.id}`} className="sr-only">סטטוס עבור {product.name}</label>
          <select
            id={`status-${product.id}`}
            value={product.status}
            disabled={pending}
            onChange={(e) => changeStatus(e.target.value)}
            className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-xs"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{PRODUCT_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>

      {message && (
        <div role="alert" className={`mt-2 rounded-lg px-3 py-2 text-xs ${message.tone === 'error' ? 'bg-red-50 text-red-700' : 'bg-brand-50 text-brand-800'}`}>
          <p className="font-medium">{message.text}</p>
          {message.blockers && message.blockers.length > 0 && (
            <ul className="mt-1 list-disc ps-4">
              {message.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}
