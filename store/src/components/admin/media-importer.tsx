'use client'

import { useRef, useState } from 'react'
import { UploadCloud, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { MatchRow } from '@/lib/media/filename-match'

interface RowState extends MatchRow {
  status: 'pending' | 'uploading' | 'done' | 'error' | 'skipped'
  error?: string
}

const MATCH_LABELS: Record<string, string> = {
  sku: 'מק״ט',
  barcode: 'ברקוד',
  supplierSku: 'מק״ט ספק',
  name: 'שם מוצר',
}

/**
 * Two-phase import: filenames are matched server-side and shown for review;
 * only after explicit approval are the files uploaded and attached.
 */
export function MediaImporter() {
  const [files, setFiles] = useState<File[]>([])
  const [rows, setRows] = useState<RowState[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [finished, setFinished] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function preview(selected: File[]) {
    setError(null)
    setFinished(false)
    setBusy(true)
    try {
      const response = await fetch('/api/admin/media/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fileNames: selected.map((f) => f.name) }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'הבדיקה נכשלה')
      setRows((data.rows as MatchRow[]).map((row) => ({ ...row, status: 'pending' })))
      setFiles(selected)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'הבדיקה נכשלה')
    } finally {
      setBusy(false)
    }
  }

  async function commit() {
    if (!rows) return
    setBusy(true)
    setError(null)

    for (const [index, row] of rows.entries()) {
      if (!row.productId) {
        setRows((current) => current!.map((r, i) => (i === index ? { ...r, status: 'skipped' } : r)))
        continue
      }
      const file = files.find((f) => f.name === row.fileName)
      if (!file) {
        setRows((current) => current!.map((r, i) => (i === index ? { ...r, status: 'error', error: 'הקובץ לא נמצא' } : r)))
        continue
      }

      setRows((current) => current!.map((r, i) => (i === index ? { ...r, status: 'uploading' } : r)))

      const body = new FormData()
      body.append('file', file)
      body.append('productId', row.productId)

      try {
        const response = await fetch('/api/admin/media/upload', { method: 'POST', body })
        const data = await response.json()
        setRows((current) =>
          current!.map((r, i) =>
            i === index
              ? response.ok && data.ok
                ? { ...r, status: 'done' }
                : { ...r, status: 'error', error: data.error ?? 'ההעלאה נכשלה' }
              : r,
          ),
        )
      } catch {
        setRows((current) => current!.map((r, i) => (i === index ? { ...r, status: 'error', error: 'שגיאת רשת' } : r)))
      }
    }

    setBusy(false)
    setFinished(true)
  }

  const matched = rows?.filter((r) => r.productId).length ?? 0
  const unmatched = rows?.filter((r) => !r.productId).length ?? 0

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-ink-200 bg-white p-5">
        <div className="rounded-card border-2 border-dashed border-ink-200 bg-ink-50/60 px-6 py-8 text-center">
          <UploadCloud className="mx-auto size-8 text-ink-400" aria-hidden />
          <p className="mt-3 text-sm font-medium text-ink-800">בחרו תמונות או תיקייה שלמה</p>
          <p className="mt-1 text-xs text-ink-500">
            מוסכמת שמות: <code dir="ltr">RPC-001-main.jpg</code>, <code dir="ltr">RPC-001-2.jpg</code>, <code dir="ltr">RPC-001-3.jpg</code>
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
              בחירת קבצים / תיקייה
            </Button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            className="sr-only"
            aria-label="בחירת תמונות לייבוא"
            // @ts-expect-error — non-standard but widely supported directory picker
            webkitdirectory=""
            onChange={(e) => {
              const selected = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'))
              if (selected.length > 0) void preview(selected)
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

      {rows && (
        <div className="rounded-card border border-ink-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
            <div>
              <h2 className="text-base font-bold text-ink-900">תצוגה מקדימה</h2>
              <p className="mt-0.5 text-xs text-ink-500">
                {matched} קבצים ישויכו · {unmatched} ללא התאמה (ידולגו)
              </p>
            </div>
            {!finished && (
              <Button onClick={commit} disabled={busy || matched === 0}>
                {busy ? 'מייבא…' : `אישור וייבוא ${matched} תמונות`}
              </Button>
            )}
            {finished && (
              <span className="flex items-center gap-1.5 text-sm font-semibold text-brand-700">
                <CheckCircle2 className="size-4" aria-hidden />הייבוא הסתיים
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">התאמות בין קבצי תמונה למוצרים</caption>
              <thead className="bg-ink-50 text-xs text-ink-600">
                <tr>
                  <th scope="col" className="px-4 py-2 text-start font-semibold">קובץ</th>
                  <th scope="col" className="px-4 py-2 text-start font-semibold">מזהה שחולץ</th>
                  <th scope="col" className="px-4 py-2 text-start font-semibold">מוצר</th>
                  <th scope="col" className="px-4 py-2 text-start font-semibold">התאמה לפי</th>
                  <th scope="col" className="px-4 py-2 text-start font-semibold">סטטוס</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((row) => (
                  <tr key={row.fileName}>
                    <td className="px-4 py-2.5" dir="ltr">{row.fileName}</td>
                    <td className="px-4 py-2.5" dir="ltr">{row.sku}</td>
                    <td className="px-4 py-2.5">
                      {row.productName ?? <span className="text-ink-400">לא נמצאה התאמה</span>}
                      {row.isMain && row.productId && <span className="ms-1.5"><Badge tone="brand">ראשית</Badge></span>}
                      {row.existingImages > 0 && <span className="ms-1.5 text-xs text-ink-400">({row.existingImages} תמונות קיימות)</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink-500">{row.matchedBy ? MATCH_LABELS[row.matchedBy] : '—'}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {row.status === 'pending' && <span className="text-ink-400">ממתין</span>}
                      {row.status === 'uploading' && <span className="text-sky-700">מעלה…</span>}
                      {row.status === 'done' && <span className="font-semibold text-brand-700">הועלה</span>}
                      {row.status === 'skipped' && <span className="text-ink-400">דולג</span>}
                      {row.status === 'error' && <span className="font-semibold text-red-600">{row.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="border-t border-ink-100 px-5 py-3 text-xs text-ink-500">
            השיוך אינו אוטומטי: שום קובץ לא נשמר עד שתאשרו. קבצים ללא התאמה מדולגים ולא נמחקים מהמחשב שלכם.
          </p>
        </div>
      )}
    </div>
  )
}
