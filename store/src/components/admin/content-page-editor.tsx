'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input, Textarea, Field } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { updateContentPageAction } from '@/app/actions/admin-misc'

export interface EditableContentPage {
  id: string
  slug: string
  kind: string
  title: string
  excerpt: string
  bodyHtml: string
  published: boolean
  metaTitle: string
  metaDescription: string
}

export function ContentPageEditor({ page }: { page: EditableContentPage }) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState(page)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const set = <K extends keyof EditableContentPage>(key: K, value: EditableContentPage[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  return (
    <section className="rounded-card border border-ink-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-start"
      >
        <span className="flex-1">
          <span className="block text-sm font-bold text-ink-900">{values.title}</span>
          <span className="block text-xs text-ink-400" dir="ltr">/page/{page.slug}</span>
        </span>
        <Badge tone={values.published ? 'success' : 'neutral'}>{values.published ? 'מפורסם' : 'טיוטה'}</Badge>
        <span className="text-xs text-ink-400">{page.kind}</span>
      </button>

      {open && (
        <form
          className="space-y-4 border-t border-ink-100 px-5 py-4"
          onSubmit={(event) => {
            event.preventDefault()
            setMessage(null)
            startTransition(async () => {
              const result = await updateContentPageAction(page.id, {
                title: values.title,
                excerpt: values.excerpt,
                bodyHtml: values.bodyHtml,
                published: values.published,
                metaTitle: values.metaTitle,
                metaDescription: values.metaDescription,
              })
              setMessage(result.ok ? 'נשמר' : result.error ?? 'השמירה נכשלה')
              if (result.ok) router.refresh()
            })
          }}
        >
          {message && <p role="alert" className="rounded-lg bg-ink-50 px-3 py-2 text-sm">{message}</p>}

          <Field label="כותרת" htmlFor={`title-${page.id}`}>
            <Input id={`title-${page.id}`} value={values.title} onChange={(e) => set('title', e.target.value)} />
          </Field>
          <Field label="תקציר" htmlFor={`excerpt-${page.id}`}>
            <Input id={`excerpt-${page.id}`} value={values.excerpt} onChange={(e) => set('excerpt', e.target.value)} />
          </Field>
          <Field label="תוכן (HTML)" htmlFor={`body-${page.id}`} hint="נשמר כפי שהוא ומוצג בעמוד הציבורי">
            <Textarea id={`body-${page.id}`} rows={8} dir="ltr" value={values.bodyHtml} onChange={(e) => set('bodyHtml', e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="כותרת Meta" htmlFor={`metaTitle-${page.id}`}>
              <Input id={`metaTitle-${page.id}`} value={values.metaTitle} onChange={(e) => set('metaTitle', e.target.value)} />
            </Field>
            <Field label="תיאור Meta" htmlFor={`metaDescription-${page.id}`}>
              <Input id={`metaDescription-${page.id}`} value={values.metaDescription} onChange={(e) => set('metaDescription', e.target.value)} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={values.published} onChange={(e) => set('published', e.target.checked)} className="size-4 rounded accent-brand-700" />
            פרסום העמוד באתר
          </label>
          <Button type="submit" disabled={pending}>{pending ? 'שומר…' : 'שמירה'}</Button>
        </form>
      )}
    </section>
  )
}
