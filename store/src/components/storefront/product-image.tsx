import Image from 'next/image'
import { ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Product imagery. A missing image never renders a broken <img> — it renders
 * a branded placeholder that says the photo is on its way.
 */
export function ProductImage({
  src,
  alt,
  sizes = '(max-width: 768px) 50vw, 300px',
  priority = false,
  className,
  placeholderLabel = 'תמונה תתווסף בקרוב',
}: {
  src: string | null | undefined
  alt: string
  sizes?: string
  priority?: boolean
  className?: string
  placeholderLabel?: string
}) {
  if (!src) {
    return (
      <div
        className={cn(
          'flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-ink-50 to-ink-100 text-ink-400',
          className,
        )}
        role="img"
        aria-label={`${alt} — ${placeholderLabel}`}
      >
        <ImageIcon className="size-8" aria-hidden />
        <span className="px-3 text-center text-[11px] font-medium leading-tight">{placeholderLabel}</span>
      </div>
    )
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={cn('product-image', className)}
    />
  )
}
