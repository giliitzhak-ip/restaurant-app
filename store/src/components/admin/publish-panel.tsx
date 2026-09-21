'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { ProductStatus } from '@/generated/prisma/enums'
import { Button } from '@/components/ui/button'
import { PRODUCT_STATUS_LABELS } from '@/lib/catalog/status'
import { ALLOWED_TRANSITIONS } from '@/lib/catalog/publish-guard'
import { changeProductStatusAction } from '@/app/actions/products'

export function PublishPanel({
  productId,
  status,
  allowed,
  blockers,
}: {
  productId: string
  status: ProductStatus
  allowed: boolean
  blockers: string[]
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function move(target: ProductStatus) {
    setError(null)
    startTransition(async () => {
      const result = await changeProductStatusAction(productId, target)
      if (!result.ok) {
        setError([result.error, ...(result.blockers ?? [])].filter(Boolean).join(' · '))
        return
      }
      router.refresh()
    })
  }

  const transitions = ALLOWED_TRANSITIONS[status] ?? []

  return (
    <section className="rounded-card border border-ink-200 bg-white p-5">
      <h2 className="text-sm font-bold text-ink-900">סטטוס ופרסום</h2>
      <p className="mt-1 text-xs text-ink-500">סטטוס נוכחי: {PRODUCT_STATUS_LABELS[status]}</p>

      <div className={`mt-4 rounded-xl px-3 py-2.5 text-xs ${allowed ? 'bg-brand-50 text-brand-800' : 'bg-amber-50 text-amber-900'}`}>
        <p className="flex items-center gap-1.5 font-semibold">
          {allowed ? <CheckCircle2 className="size-3.5" aria-hidden /> : <AlertTriangle className="size-3.5" aria-hidden />}
          {allowed ? 'המוצר עומד בתנאי הפרסום' : 'חסמי פרסום'}
        </p>
        {!allowed && (
          <ul className="mt-1.5 list-disc space-y-0.5 ps-4">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        )}
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {transitions.map((target) => (
          <Button
            key={target}
            size="sm"
            variant={target === 'PUBLISHED' ? 'primary' : 'outline'}
            disabled={pending || (target === 'PUBLISHED' && !allowed)}
            onClick={() => move(target)}
          >
            {target === 'PUBLISHED' ? 'פרסום בחנות' : PRODUCT_STATUS_LABELS[target]}
          </Button>
        ))}
      </div>
    </section>
  )
}
