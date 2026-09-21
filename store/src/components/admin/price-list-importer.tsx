'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadCloud, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatAgorot } from '@/lib/money'
import { IMPORT_FIELDS, IMPORT_FIELD_LABELS, type ColumnMapping, type PreviewRow } from '@/lib/suppliers/price-list'
import { approveImportAction } from '@/app/actions/suppliers'

const CHANGE_LABELS: Record<PreviewRow['change'], { label: string; tone: 'success' | 'info' | 'neutral' | 'warning' | 'danger' }> = {
  NEW_PRODUCT: { label: 'מוצר חדש', tone: 'info' },
  PRICE_CHANGED: { label: 'מחיר השתנה', tone: 'warning' },
  UNCHANGED: { label: 'ללא שינוי', tone: 'neutral' },
  NOT_FOUND: { label: 'לא נמצא', tone: 'danger' },
  DUPLICATE_SKU: { label: 'מק״ט כפול', tone: 'danger' },
  INVALID: { label: 'שורה לא תקינה', tone: 'danger' },
}

interface PreviewResponse {
  importId: string
  headers: string[]
  mapping: ColumnMapping
  preview: PreviewRow[]
  summary: Record<string, number>
}

export function PriceListImporter({ supplierId }: { supplierId: string }) {
  const [file, setFile] = useState<File | null>(null)
  const [data, setData] = useState<PreviewResponse | null>(null)
  const [approved, setApproved] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ updated: number; created: number; skipped: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function upload(selected: File, mapping?: ColumnMapping) {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const body = new FormData()
      body.append('file', selected)
      body.append('supplierId', supplierId)
      if (mapping) body.append('mapping', JSON.stringify(mapping))

      const response = await fetch('/api/admin/suppliers/import', { method: 'POST', body })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error ?? 'הייבוא נכשל')

      setData(json as PreviewResponse)
      setApproved(new Set((json.preview as PreviewRow[]).filter((r) => r.change === 'PRICE_CHANGED' || r.change === 'NEW_PRODUCT').map((r) => r.index)))
      setFile(selected)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'הייבוא נכשל')
    } finally {
      setBusy(false)
    }
  }

  function remap(field: string, header: string) {
    if (!data || !file) return
    const mapping: ColumnMapping = { ...data.mapping, [field]: header || undefined }
    void upload(file, mapping)
  }

  function toggle(index: number) {
    setApproved((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  async function commit() {
    if (!data) return
    setBusy(true)
    setError(null)
    const result = await approveImportAction(data.importId, [...approved])
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? 'הייבוא נכשל')
      return
    }
    setDone({ updated: result.updated ?? 0, created: result.created ?? 0, skipped: result.skipped ?? 0 })
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-ink-200 bg-white p-5">
        <div className="rounded-card border-2 border-dashed border-ink-200 bg-ink-50/60 px-6 py-8 text-center">
          <UploadCloud className="mx-auto size-8 text-ink-400" aria-hidden />
          <p className="mt-3 text-sm font-medium text-ink-800">העלאת מחירון</p>
          <p className="mt-1 text-xs text-ink-500">קבצי CSV או XLSX · שורה ראשונה = כותרות</p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => inputRef.current?.click()} disabled={busy}>
            בחירת קובץ
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            aria-label="בחירת קובץ מחירון"
            onChange={(e) => {
              const selected = e.target.files?.[0]
              if (selected) void upload(selected)
              e.target.value = ''
            }}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <AlertCircle className="size-4" aria-hidden />{error}
        </p>
      )}

      {done && (
        <p className="flex items-center gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm font-medium text-brand-800">
          <CheckCircle2 className="size-4" aria-hidden />
          הייבוא הסתיים: {done.updated} עודכנו · {done.created} נוצרו · {done.skipped} דולגו
        </p>
      )}

      {data && (
        <>
          <section className="rounded-card border border-ink-200 bg-white p-5">
            <h2 className="text-base font-bold text-ink-900">מיפוי עמודות</h2>
            <p className="mt-1 text-xs text-ink-500">המערכת הציעה מיפוי אוטומטי. ניתן לשנות ולטעון מחדש את התצוגה המקדימה.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {IMPORT_FIELDS.map((field) => (
                <label key={field} className="text-xs font-medium text-ink-700">
                  {IMPORT_FIELD_LABELS[field]}
                  <select
                    value={data.mapping[field] ?? ''}
                    onChange={(e) => remap(field, e.target.value)}
                    disabled={busy}
                    className="mt-1 block h-9 w-full rounded-lg border border-ink-200 bg-white px-2 text-xs"
                  >
                    <option value="">— לא ממופה —</option>
                    {data.headers.map((header) => (
                      <option key={header} value={header}>{header}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-card border border-ink-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-ink-900">תצוגה מקדימה</h2>
                <p className="mt-0.5 flex flex-wrap gap-1.5 text-xs">
                  {Object.entries(data.summary).map(([key, count]) => (
                    <Badge key={key} tone={CHANGE_LABELS[key as PreviewRow['change']]?.tone ?? 'neutral'}>
                      {CHANGE_LABELS[key as PreviewRow['change']]?.label ?? key}: {count}
                    </Badge>
                  ))}
                </p>
              </div>
              {!done && (
                <Button onClick={commit} disabled={busy || approved.size === 0}>
                  {busy ? 'מייבא…' : `אישור וייבוא ${approved.size} שורות`}
                </Button>
              )}
            </div>

            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">שורות המחירון והשינויים שזוהו</caption>
                <thead className="sticky top-0 bg-ink-50 text-xs text-ink-600">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-start font-semibold">אישור</th>
                    <th scope="col" className="px-3 py-2 text-start font-semibold">מק״ט ספק</th>
                    <th scope="col" className="px-3 py-2 text-start font-semibold">מוצר</th>
                    <th scope="col" className="px-3 py-2 text-start font-semibold">עלות נוכחית</th>
                    <th scope="col" className="px-3 py-2 text-start font-semibold">עלות חדשה</th>
                    <th scope="col" className="px-3 py-2 text-start font-semibold">שינוי</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data.preview.map((row) => {
                    const meta = CHANGE_LABELS[row.change]
                    const selectable = row.change === 'PRICE_CHANGED' || row.change === 'NEW_PRODUCT' || row.change === 'UNCHANGED'
                    return (
                      <tr key={row.index}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={approved.has(row.index)}
                            disabled={!selectable || Boolean(done)}
                            onChange={() => toggle(row.index)}
                            aria-label={`אישור שורה ${row.index + 1}`}
                            className="size-4 rounded accent-brand-700"
                          />
                        </td>
                        <td className="px-3 py-2 text-xs" dir="ltr">{row.supplierSku ?? row.sku ?? '—'}</td>
                        <td className="px-3 py-2 text-xs">{row.productName ?? row.name ?? '—'}</td>
                        <td className="px-3 py-2 text-xs">{row.currentCost === null ? '—' : formatAgorot(row.currentCost)}</td>
                        <td className="px-3 py-2 text-xs font-semibold">{row.cost === null ? '—' : formatAgorot(row.cost)}</td>
                        <td className="px-3 py-2">
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                          {row.note && <span className="ms-1.5 text-[11px] text-ink-400">{row.note}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <p className="border-t border-ink-100 px-5 py-3 text-xs text-ink-500">
              הייבוא מעדכן מחירי עלות ומק״ט ספק בלבד. שם המוצר, מחיר המכירה, התמונות והמידע הרגולטורי לא נדרסים.
              מוצר חדש נוצר תמיד כטיוטה ללא מחיר מכירה.
            </p>
          </section>
        </>
      )}
    </div>
  )
}
