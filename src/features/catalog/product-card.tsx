"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, Heart, Sparkles } from "lucide-react";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { blurDataUrl } from "@/lib/media";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { Badge } from "@/components/ui/badge";
import { PriceTag } from "@/features/catalog/price-tag";
import { useFavorites } from "@/features/catalog/favorites-provider";
import { QuickView } from "@/features/catalog/quick-view";
import type { Product } from "@/types/catalog";

export function ProductCard({
  product,
  priority = false,
  className,
}: {
  product: Product;
  priority?: boolean;
  className?: string;
}) {
  const { isFavorite, toggle } = useFavorites();
  const [quickView, setQuickView] = React.useState(false);
  const favorite = isFavorite(product.id);

  const studio = product.images.find((image) => image.kind === "STUDIO") ?? product.images[0];
  const room = product.images.find((image) => image.kind === "ROOM");
  const canVisualise = Boolean(product.texture);

  return (
    <article className={cn("group relative flex flex-col", className)}>
      <div className="relative overflow-hidden rounded-sm bg-surface-2">
        <Link
          href={routes.product(product.slug)}
          className="block"
          aria-label={product.name}
        >
          <span className="relative block aspect-[4/5]">
            {studio ? (
              <Image
                src={studio.url}
                alt={studio.alt}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 24vw"
                priority={priority}
                placeholder="blur"
                blurDataURL={blurDataUrl}
                className={cn(
                  "object-cover transition-[opacity,transform] duration-700 ease-[cubic-bezier(.22,1,.36,1)]",
                  room ? "group-hover:opacity-0" : "group-hover:scale-[1.03]",
                )}
              />
            ) : null}
            {room ? (
              <Image
                src={room.url}
                alt={room.alt}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 24vw"
                loading="lazy"
                className="object-cover opacity-0 transition-opacity duration-700 ease-[cubic-bezier(.22,1,.36,1)] group-hover:opacity-100"
              />
            ) : null}
          </span>
        </Link>

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
          <div className="flex flex-wrap gap-1.5">
            {product.isNew ? <Badge variant="ink">{t.common.new}</Badge> : null}
            {product.bestSeller ? (
              <Badge variant="brass">{t.common.bestSeller}</Badge>
            ) : null}
            {product.compareAtPrice ? (
              <Badge variant="danger">{t.common.onSale}</Badge>
            ) : null}
            {product.availability === "OUT_OF_STOCK" ? (
              <Badge variant="neutral">{t.common.outOfStock}</Badge>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => toggle(product.id)}
            aria-pressed={favorite}
            aria-label={favorite ? t.catalog.removeFavorite : t.catalog.addFavorite}
            className="pointer-events-auto rounded-full bg-surface/85 p-2 text-ink shadow-subtle backdrop-blur-sm transition-colors hover:bg-surface"
          >
            <Heart
              className={cn("size-4", favorite && "fill-clay text-clay")}
            />
          </button>
        </div>

        {/* Hover / focus actions — always reachable on touch via the row below */}
        <div className="absolute inset-x-2.5 bottom-2.5 hidden gap-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100 md:flex">
          {canVisualise ? (
            <Link
              href={routes.designerWithProduct(
                product.slug,
                product.specs.surface === "WALL" ? "wall" : "floor",
              )}
              onClick={() => track("start_room_designer", { entry: "product" })}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xs bg-ink/92 px-3 py-2.5 text-xs text-canvas backdrop-blur-sm transition-colors hover:bg-ink"
            >
              <Sparkles className="size-3.5" />
              {t.catalog.tryInRoom}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => setQuickView(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xs bg-surface/92 px-3 py-2.5 text-xs text-ink backdrop-blur-sm transition-colors hover:bg-surface"
          >
            <Eye className="size-3.5" />
            {t.catalog.quickView}
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col pt-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={routes.product(product.slug)} className="link-quiet">
              <h3 className="truncate text-[0.9375rem] font-medium text-ink">
                {product.name}
              </h3>
            </Link>
            <p className="mt-0.5 truncate text-xs text-muted">{product.subtitle}</p>
          </div>
          <span
            className="mt-1 size-4 shrink-0 rounded-full border border-line-strong"
            style={{ backgroundColor: product.specs.colorHex }}
            title={product.specs.colorName}
            aria-hidden
          />
        </div>

        <PriceTag product={product} size="sm" className="mt-2.5" />

        <div className="mt-3 flex gap-2 md:hidden">
          {canVisualise ? (
            <Link
              href={routes.designerWithProduct(
                product.slug,
                product.specs.surface === "WALL" ? "wall" : "floor",
              )}
              onClick={() => track("start_room_designer", { entry: "product" })}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xs border border-line-strong px-2.5 py-2 text-xs text-ink"
            >
              <Sparkles className="size-3.5" />
              {t.catalog.tryInRoom}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => setQuickView(true)}
            className="inline-flex items-center justify-center rounded-xs border border-line-strong px-2.5 py-2 text-xs text-ink"
            aria-label={t.catalog.quickView}
          >
            <Eye className="size-3.5" />
          </button>
        </div>
      </div>

      <QuickView product={product} open={quickView} onOpenChange={setQuickView} />
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="skeleton aspect-[4/5] rounded-sm" />
      <div className="skeleton mt-3.5 h-4 w-3/4 rounded-xs" />
      <div className="skeleton mt-2 h-3 w-1/2 rounded-xs" />
      <div className="skeleton mt-3 h-5 w-2/5 rounded-xs" />
    </div>
  );
}
