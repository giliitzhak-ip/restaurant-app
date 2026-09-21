'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'
import { SlidersHorizontal } from 'lucide-react'

const TOGGLES = [
  { key: 'poisonFree', label: 'ללא רעל' },
  { key: 'readyToUse', label: 'מוכן לשימוש' },
  { key: 'bestSeller', label: 'רב מכר' },
  { key: 'new', label: 'חדש' },
  { key: 'sale', label: 'במבצע' },
  { key: 'inStock', label: 'במלאי' },
] as const

const SORTS = [
  { value: 'recommended', label: 'מומלצים' },
  { value: 'popular', label: 'פופולריים' },
  { value: 'price_asc', label: 'מחיר: נמוך לגבוה' },
  { value: 'price_desc', label: 'מחיר: גבוה לנמוך' },
  { value: 'newest', label: 'חדש' },
]

export function CatalogFilters({ brands }: { brands: string[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const update = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString())
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
      next.delete('page')
      router.push(`${pathname}?${next.toString()}`, { scroll: false })
    },
    [params, pathname, router],
  )

  return (
    <aside aria-label="סינון ומיון" className="space-y-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
        <SlidersHorizontal className="size-4" aria-hidden />
        סינון
      </div>

      <div>
        <label htmlFor="sort" className="mb-1.5 block text-xs font-semibold text-ink-700">מיון</label>
        <select
          id="sort"
          value={params.get('sort') ?? 'recommended'}
          onChange={(e) => update('sort', e.target.value === 'recommended' ? null : e.target.value)}
          className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <fieldset>
        <legend className="mb-2 text-xs font-semibold text-ink-700">טווח מחירים (₪)</legend>
        <div className="flex items-center gap-2">
          <label htmlFor="minPrice" className="sr-only">מחיר מינימלי</label>
          <input
            id="minPrice"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={params.get('minPrice') ?? ''}
            onBlur={(e) => update('minPrice', e.target.value)}
            placeholder="מ-"
            className="h-10 w-full rounded-xl border border-ink-200 px-2.5 text-sm"
          />
          <span aria-hidden className="text-ink-400">–</span>
          <label htmlFor="maxPrice" className="sr-only">מחיר מרבי</label>
          <input
            id="maxPrice"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={params.get('maxPrice') ?? ''}
            onBlur={(e) => update('maxPrice', e.target.value)}
            placeholder="עד"
            className="h-10 w-full rounded-xl border border-ink-200 px-2.5 text-sm"
          />
        </div>
      </fieldset>

      {brands.length > 0 && (
        <div>
          <label htmlFor="brand" className="mb-1.5 block text-xs font-semibold text-ink-700">מותג</label>
          <select
            id="brand"
            value={params.get('brand') ?? ''}
            onChange={(e) => update('brand', e.target.value)}
            className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm"
          >
            <option value="">הכל</option>
            {brands.map((brand) => (
              <option key={brand} value={brand}>{brand}</option>
            ))}
          </select>
        </div>
      )}

      <fieldset>
        <legend className="mb-2 text-xs font-semibold text-ink-700">סוג פתרון</legend>
        <div className="space-y-2">
          {(['INDOOR', 'OUTDOOR'] as const).map((env) => (
            <label key={env} className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="radio"
                name="environment"
                checked={params.get('environment') === env}
                onChange={() => update('environment', env)}
                className="size-4 accent-brand-700"
              />
              {env === 'INDOOR' ? 'לשימוש פנים' : 'לשימוש חוץ'}
            </label>
          ))}
          <button
            type="button"
            onClick={() => update('environment', null)}
            className="text-xs font-medium text-brand-700 underline"
          >
            ניקוי בחירה
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-xs font-semibold text-ink-700">מאפיינים</legend>
        <div className="space-y-2">
          {TOGGLES.map((toggle) => (
            <label key={toggle.key} className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={params.get(toggle.key) === '1'}
                onChange={(e) => update(toggle.key, e.target.checked ? '1' : null)}
                className="size-4 rounded accent-brand-700"
              />
              {toggle.label}
            </label>
          ))}
        </div>
      </fieldset>
    </aside>
  )
}
