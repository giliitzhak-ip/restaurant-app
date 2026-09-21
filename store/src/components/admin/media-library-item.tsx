'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { deleteMediaAssetAction } from '@/app/actions/media'

export interface LibraryMedia {
  id: string
  thumbnailUrl: string
  originalName: string | null
  width: number | null
  height: number | null
  fileSize: number
  usageCount: number
  firstProduct: { id: string; name: string } | null
}

export function MediaLibraryItem({ media }: { media: LibraryMedia }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <li className="rounded-card border border-ink-200 bg-white p-2">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-white">
        <Image src={media.thumbnailUrl} alt={media.originalName ?? 'תמונה בספרייה'} fill sizes="200px" className="product-image" />
      </div>
      <p className="mt-2 truncate text-xs font-medium text-ink-800" dir="ltr">{media.originalName ?? '—'}</p>
      <p className="text-[10px] text-ink-400">
        {media.width && media.height ? `${media.width}×${media.height} · ` : ''}{Math.round(media.fileSize / 1024)}KB
      </p>
      {media.firstProduct ? (
        <Link href={`/admin/products/${media.firstProduct.id}`} className="mt-1 block truncate text-[11px] font-medium text-brand-700 hover:underline">
          {media.firstProduct.name}
          {media.usageCount > 1 ? ` (+${media.usageCount - 1})` : ''}
        </Link>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm('למחוק את התמונה מהספרייה?')) return
            startTransition(async () => {
              const result = await deleteMediaAssetAction(media.id)
              if (!result.ok) setError(result.error ?? 'המחיקה נכשלה')
              else router.refresh()
            })
          }}
          className="mt-1 flex items-center gap-1 text-[11px] font-medium text-ink-500 hover:text-red-600"
        >
          <Trash2 className="size-3" aria-hidden />מחיקה
        </button>
      )}
      {error && <p role="alert" className="mt-1 text-[10px] font-medium text-red-600">{error}</p>}
    </li>
  )
}
