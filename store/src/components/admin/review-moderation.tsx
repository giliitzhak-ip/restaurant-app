'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { moderateReviewAction } from '@/app/actions/admin-misc'
import type { ReviewStatus } from '@/generated/prisma/enums'

const STATUS_LABELS: Record<ReviewStatus, string> = {
  PENDING: 'ממתינה',
  APPROVED: 'מאושרת',
  REJECTED: 'נדחתה',
}

export function ReviewModeration({
  review,
}: {
  review: {
    id: string
    productName: string
    authorName: string
    rating: number
    title: string | null
    body: string
    status: ReviewStatus
    verifiedPurchase: boolean
  }
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function moderate(status: 'APPROVED' | 'REJECTED') {
    setError(null)
    startTransition(async () => {
      const result = await moderateReviewAction(review.id, status)
      if (!result.ok) setError(result.error ?? 'הפעולה נכשלה')
      else router.refresh()
    })
  }

  return (
    <li className="rounded-card border border-ink-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-900">{review.productName}</span>
        <Badge tone={review.status === 'APPROVED' ? 'success' : review.status === 'REJECTED' ? 'danger' : 'warning'}>
          {STATUS_LABELS[review.status]}
        </Badge>
        {review.verifiedPurchase && <Badge tone="info">רכישה מאומתת</Badge>}
      </div>
      <p className="mt-1 text-xs text-amber-600" aria-label={`דירוג ${review.rating} מתוך 5`}>
        {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
      </p>
      <p className="mt-1 text-xs text-ink-500">{review.authorName}</p>
      {review.title && <p className="mt-2 text-sm font-semibold text-ink-800">{review.title}</p>}
      <p className="mt-1 text-sm text-ink-600">{review.body}</p>

      {error && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{error}</p>}

      {review.status === 'PENDING' && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" disabled={pending} onClick={() => moderate('APPROVED')}>אישור</Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => moderate('REJECTED')}>דחייה</Button>
        </div>
      )}
    </li>
  )
}
