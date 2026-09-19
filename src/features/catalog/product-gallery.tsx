"use client";

import * as React from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { t } from "@/i18n";
import { blurDataUrl } from "@/lib/media";
import { cn } from "@/lib/utils";
import type { ProductImage } from "@/types/catalog";

export function ProductGallery({
  images,
  name,
}: {
  images: ProductImage[];
  name: string;
}) {
  const [index, setIndex] = React.useState(0);
  const active = images[index] ?? images[0];
  const trackRef = React.useRef<HTMLDivElement>(null);

  if (!active) return null;

  const go = (next: number) => {
    const bounded = (next + images.length) % images.length;
    setIndex(bounded);
  };

  return (
    <div className="flex flex-col gap-3 md:flex-row-reverse md:gap-4">
      <div className="relative flex-1 overflow-hidden rounded-sm bg-surface-2">
        <div
          ref={trackRef}
          // Focusable so the swipeable strip is reachable without a pointer.
          tabIndex={0}
          role="region"
          aria-label={t.product.gallery}
          className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass md:overflow-hidden"
          onScroll={(event) => {
            // Mobile: the gallery is a swipeable strip, so keep the dots in sync.
            const element = event.currentTarget;
            const width = element.clientWidth || 1;
            const next = Math.round(element.scrollLeft / width);
            if (next !== index) setIndex(Math.abs(next) % images.length);
          }}
        >
          {images.map((image, imageIndex) => (
            <div
              key={image.id}
              className={cn(
                "relative aspect-4/5 w-full shrink-0 snap-center sm:aspect-4/3 md:aspect-4/5",
                imageIndex !== index && "md:hidden",
              )}
            >
              <Image
                src={image.url}
                alt={image.alt || name}
                fill
                sizes="(max-width: 768px) 100vw, 55vw"
                priority={imageIndex === 0}
                placeholder="blur"
                blurDataURL={blurDataUrl}
                className="object-cover"
              />
            </div>
          ))}
        </div>

        {images.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label={t.common.next}
              className="absolute start-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-canvas/85 p-2.5 text-ink shadow-subtle backdrop-blur-sm transition-colors hover:bg-canvas md:block"
            >
              <ChevronRight className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label={t.common.previous}
              className="absolute end-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-canvas/85 p-2.5 text-ink shadow-subtle backdrop-blur-sm transition-colors hover:bg-canvas md:block"
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5 md:hidden">
              {images.map((image, dotIndex) => (
                <span
                  key={image.id}
                  className={cn(
                    "size-1.5 rounded-full transition-colors",
                    dotIndex === index ? "bg-ink" : "bg-ink/25",
                  )}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      {images.length > 1 ? (
        <ul className="hidden w-20 shrink-0 flex-col gap-3 md:flex">
          {images.map((image, thumbIndex) => (
            <li key={image.id}>
              <button
                type="button"
                onClick={() => setIndex(thumbIndex)}
                aria-label={t.product.galleryThumbAria(thumbIndex + 1)}
                aria-current={thumbIndex === index}
                className={cn(
                  "relative block aspect-square w-full overflow-hidden rounded-xs border transition-colors",
                  thumbIndex === index
                    ? "border-ink"
                    : "border-transparent hover:border-line-strong",
                )}
              >
                <Image
                  src={image.url}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
