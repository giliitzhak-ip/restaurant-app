'use client'

import { useCallback, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { UploadCloud, Star, Trash2, Repeat, GripVertical, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  setMainImageAction, reorderMediaAction, removeProductMediaAction, updateAltTextAction,
} from '@/app/actions/media'

export interface ManagedImage {
  productMediaId: string
  mediaId: string
  thumbnailUrl: string
  alt: string
  isMain: boolean
  fileName: string | null
  width: number | null
  height: number | null
  fileSize: number
}

interface UploadTask {
  id: string
  fileName: string
  progress: number
  status: 'uploading' | 'done' | 'error'
  error?: string
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif'

function uploadWithProgress(
  file: File,
  productId: string,
  onProgress: (percent: number) => void,
  replaceProductMediaId?: string,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const body = new FormData()
    body.append('file', file)
    body.append('productId', productId)
    if (replaceProductMediaId) body.append('replaceProductMediaId', replaceProductMediaId)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/admin/media/upload')
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    })
    xhr.addEventListener('load', () => {
      try {
        const data = JSON.parse(xhr.responseText) as { ok?: boolean; error?: string }
        resolve(xhr.status >= 200 && xhr.status < 300 && data.ok ? { ok: true } : { ok: false, error: data.error ?? 'ההעלאה נכשלה' })
      } catch {
        resolve({ ok: false, error: 'תגובה לא תקינה מהשרת' })
      }
    })
    xhr.addEventListener('error', () => resolve({ ok: false, error: 'שגיאת רשת בזמן ההעלאה' }))
    xhr.send(body)
  })
}

/**
 * Product image manager: drag & drop or multi-select upload with per-file
 * progress, reordering by drag, main-image selection, replace, delete and
 * per-image alt text.
 */
export function MediaManager({ productId, images }: { productId: string; images: ManagedImage[] }) {
  const router = useRouter()
  const [dragActive, setDragActive] = useState(false)
  const [tasks, setTasks] = useState<UploadTask[]>([])
  const [order, setOrder] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const replaceTargetRef = useRef<string | null>(null)
  const dragIndexRef = useRef<number | null>(null)

  const ordered = order
    ? order.flatMap((id) => images.find((image) => image.productMediaId === id) ?? [])
    : images

  const handleFiles = useCallback(
    async (files: FileList | null, replaceId?: string) => {
      if (!files || files.length === 0) return
      setError(null)
      const list = Array.from(files)

      const newTasks: UploadTask[] = list.map((file) => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
        fileName: file.name,
        progress: 0,
        status: 'uploading',
      }))
      setTasks((current) => [...current, ...newTasks])

      for (const [index, file] of list.entries()) {
        const task = newTasks[index]
        const result = await uploadWithProgress(
          file,
          productId,
          (percent) => setTasks((current) => current.map((t) => (t.id === task.id ? { ...t, progress: percent } : t))),
          replaceId,
        )
        setTasks((current) =>
          current.map((t) =>
            t.id === task.id
              ? { ...t, progress: 100, status: result.ok ? 'done' : 'error', error: result.error }
              : t,
          ),
        )
      }

      setOrder(null)
      router.refresh()
      setTimeout(() => setTasks((current) => current.filter((t) => t.status === 'error')), 3000)
    },
    [productId, router],
  )

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true)
    setError(null)
    const result = await fn()
    if (!result.ok) setError(result.error ?? 'הפעולה נכשלה')
    setBusy(false)
    router.refresh()
  }

  function onDropSort(targetIndex: number) {
    const from = dragIndexRef.current
    dragIndexRef.current = null
    if (from === null || from === targetIndex) return
    const ids = ordered.map((image) => image.productMediaId)
    const [moved] = ids.splice(from, 1)
    ids.splice(targetIndex, 0, moved)
    setOrder(ids)
    void run(() => reorderMediaAction(productId, ids))
  }

  return (
    <section aria-labelledby="media-heading" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 id="media-heading" className="text-base font-bold text-ink-900">תמונות המוצר</h2>
        <span className="text-xs text-ink-500">{images.length} תמונות</span>
      </div>

      {error && (
        <p role="alert" className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          <AlertCircle className="size-4" aria-hidden />
          {error}
        </p>
      )}

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => { e.preventDefault(); setDragActive(false); void handleFiles(e.dataTransfer.files) }}
        className={cn(
          'rounded-card border-2 border-dashed px-6 py-8 text-center transition-colors',
          dragActive ? 'border-brand-500 bg-brand-50' : 'border-ink-200 bg-ink-50/60',
        )}
      >
        <UploadCloud className="mx-auto size-8 text-ink-400" aria-hidden />
        <p className="mt-3 text-sm font-medium text-ink-800">גררו תמונות לכאן או בחרו קבצים</p>
        <p className="mt-1 text-xs text-ink-500">JPG, PNG, WEBP, AVIF · ניתן לבחור כמה קבצים יחד</p>
        <Button type="button" variant="outline" className="mt-4" onClick={() => fileInputRef.current?.click()}>
          בחירת קבצים
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          aria-label="בחירת תמונות להעלאה"
          onChange={(e) => { void handleFiles(e.target.files); e.target.value = '' }}
        />
      </div>

      {/* Replace target input (hidden) */}
      <input
        ref={replaceInputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        aria-label="החלפת תמונה"
        onChange={(e) => {
          const target = replaceTargetRef.current
          if (target) void handleFiles(e.target.files, target)
          replaceTargetRef.current = null
          e.target.value = ''
        }}
      />

      {/* Upload progress */}
      {tasks.length > 0 && (
        <ul className="space-y-2" aria-live="polite">
          {tasks.map((task) => (
            <li key={task.id} className="rounded-xl border border-ink-200 bg-white px-3 py-2">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate font-medium text-ink-800">{task.fileName}</span>
                {task.status === 'done' && <CheckCircle2 className="size-4 shrink-0 text-brand-600" aria-label="הועלה" />}
                {task.status === 'error' && <span className="shrink-0 font-medium text-red-600">{task.error}</span>}
                {task.status === 'uploading' && <span className="shrink-0 text-ink-500">{task.progress}%</span>}
              </div>
              {task.status === 'uploading' && (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-ink-100">
                  <div className="h-full bg-brand-600 transition-[width]" style={{ width: `${task.progress}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Gallery */}
      {ordered.length === 0 ? (
        <p className="rounded-xl bg-ink-50 px-4 py-6 text-center text-sm text-ink-500">
          עדיין אין תמונות. מוצר ללא תמונה לא ניתן לפרסום בחנות.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {ordered.map((image, index) => (
            <li
              key={image.productMediaId}
              draggable
              onDragStart={() => { dragIndexRef.current = index }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDropSort(index)}
              className={cn(
                'group rounded-card border bg-white p-2',
                image.isMain ? 'border-brand-500 ring-1 ring-brand-200' : 'border-ink-200',
              )}
            >
              <div className="relative aspect-square overflow-hidden rounded-lg bg-white">
                <Image src={image.thumbnailUrl} alt={image.alt || 'תמונת מוצר'} fill sizes="200px" className="product-image" />
                <span className="absolute top-1.5 cursor-grab rounded bg-white/90 p-1 text-ink-500 start-1.5" aria-hidden>
                  <GripVertical className="size-3.5" />
                </span>
                {image.isMain && (
                  <span className="absolute top-1.5 end-1.5">
                    <Badge tone="brand">ראשית</Badge>
                  </span>
                )}
              </div>

              <label className="mt-2 block">
                <span className="sr-only">טקסט חלופי לתמונה {index + 1}</span>
                <input
                  type="text"
                  defaultValue={image.alt}
                  placeholder="טקסט חלופי (Alt)"
                  maxLength={200}
                  onBlur={(e) => {
                    if (e.target.value !== image.alt) void run(() => updateAltTextAction(productId, image.productMediaId, e.target.value))
                  }}
                  className="h-8 w-full rounded-lg border border-ink-200 px-2 text-xs"
                />
              </label>

              <div className="mt-2 flex flex-wrap gap-1">
                {!image.isMain && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => setMainImageAction(productId, image.productMediaId))}
                    className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-medium text-ink-600 hover:bg-brand-50 hover:text-brand-700"
                  >
                    <Star className="size-3" aria-hidden />
                    הגדר כראשית
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { replaceTargetRef.current = image.productMediaId; replaceInputRef.current?.click() }}
                  className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-100"
                >
                  <Repeat className="size-3" aria-hidden />
                  החלפה
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (confirm('להסיר את התמונה מהמוצר?')) void run(() => removeProductMediaAction(productId, image.productMediaId))
                  }}
                  className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-medium text-ink-600 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="size-3" aria-hidden />
                  מחיקה
                </button>
              </div>

              <p className="mt-1.5 truncate text-[10px] text-ink-400">
                {image.width && image.height ? `${image.width}×${image.height} · ` : ''}
                {Math.round(image.fileSize / 1024)}KB
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-ink-500">
        התמונה הראשונה הופכת אוטומטית לתמונה הראשית. ניתן לגרור תמונות כדי לשנות את הסדר.
      </p>
    </section>
  )
}
