'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { ZoomIn } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProductImage } from './product-image'

export interface GalleryImage {
  id: string
  url: string
  zoomUrl: string
  thumbUrl: string
  alt: string
}

/**
 * Desktop: large stage plus a thumbnail rail and click-to-zoom.
 * Mobile: a native scroll-snap swipe gallery with dot indicators.
 */
export function ProductGallery({ images, productName }: { images: GalleryImage[]; productName: string }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [zoomed, setZoomed] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)

  if (images.length === 0) {
    return (
      <div className="relative aspect-square overflow-hidden rounded-card border border-ink-200 bg-white">
        <ProductImage src={null} alt={productName} />
      </div>
    )
  }

  const active = images[Math.min(activeIndex, images.length - 1)]

  function onScroll() {
    const el = trackRef.current
    if (!el) return
    const index = Math.round((el.scrollWidth - el.scrollLeft - el.clientWidth) / el.clientWidth)
    setActiveIndex(Math.max(0, Math.min(images.length - 1, index)))
  }

  return (
    <div>
      {/* Mobile swipe gallery */}
      <div className="md:hidden">
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="flex snap-x snap-mandatory overflow-x-auto rounded-card border border-ink-200 bg-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label={`גלריית תמונות של ${productName}`}
        >
          {images.map((image) => (
            <div key={image.id} className="relative aspect-square w-full shrink-0 snap-center">
              <Image src={image.url} alt={image.alt} fill sizes="100vw" className="product-image" priority={image.id === images[0].id} />
            </div>
          ))}
        </div>
        {images.length > 1 && (
          <div className="mt-3 flex justify-center gap-1.5" aria-hidden>
            {images.map((image, index) => (
              <span
                key={image.id}
                className={cn('size-1.5 rounded-full transition-colors', index === activeIndex ? 'bg-brand-700' : 'bg-ink-200')}
              />
            ))}
          </div>
        )}
      </div>

      {/* Desktop stage + rail */}
      <div className="hidden gap-3 md:flex">
        {images.length > 1 && (
          <ul className="flex w-20 shrink-0 flex-col gap-2" aria-label="תמונות נוספות">
            {images.map((image, index) => (
              <li key={image.id}>
                <button
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  aria-label={`הצגת תמונה ${index + 1}`}
                  aria-current={index === activeIndex}
                  className={cn(
                    'relative aspect-square w-full overflow-hidden rounded-xl border bg-white transition-colors',
                    index === activeIndex ? 'border-brand-600' : 'border-ink-200 hover:border-ink-400',
                  )}
                >
                  <Image src={image.thumbUrl} alt="" fill sizes="80px" className="product-image" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="relative flex-1">
          <button
            type="button"
            onClick={() => setZoomed(true)}
            className="relative block aspect-square w-full overflow-hidden rounded-card border border-ink-200 bg-white"
            aria-label="הגדלת התמונה"
          >
            <Image src={active.url} alt={active.alt} fill sizes="(max-width: 1024px) 60vw, 520px" className="product-image" priority />
            <span className="absolute bottom-3 flex items-center gap-1.5 rounded-pill bg-white/90 px-3 py-1.5 text-xs font-medium text-ink-700 shadow-soft end-3">
              <ZoomIn className="size-3.5" aria-hidden />
              הגדלה
            </span>
          </button>
        </div>
      </div>

      {zoomed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/85 p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`תצוגה מוגדלת — ${productName}`}
        >
          <button type="button" className="absolute inset-0" aria-label="סגירת התצוגה" onClick={() => setZoomed(false)} />
          <div className="relative aspect-square w-full max-w-3xl overflow-hidden rounded-card bg-white">
            <Image src={active.zoomUrl} alt={active.alt} fill sizes="90vw" className="product-image" />
          </div>
        </div>
      )}
    </div>
  )
}
