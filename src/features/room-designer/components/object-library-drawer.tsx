"use client";

import * as React from "react";
import { Info, Plus, Search } from "lucide-react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import type { DesignObjectAsset } from "@/types/scene";

/**
 * "Add items".
 *
 * A grid of transparent artwork, grouped by category, on the dark studio
 * surface. Tapping one puts it in the room; there is no drag-from-here
 * requirement, because on a phone dragging out of a bottom sheet and onto a
 * photo behind it is a gesture that fails more often than it works. Dragging
 * *within* the room is how things are positioned, and that works everywhere.
 *
 * The badge is the honest part. Most of these are drawings we made so a room
 * can be pictured; they are marked "להמחשה בלבד" and cannot be bought. An
 * item only loses that badge when an administrator has linked it to a real
 * catalogue product, and the price shown is that product's — read from the
 * catalogue, never typed onto the library row.
 */
export function ObjectLibraryDrawer({
  assets,
  onAdd,
  onUploadOwn,
  className,
}: {
  assets: DesignObjectAsset[];
  onAdd: (asset: DesignObjectAsset) => void;
  onUploadOwn: () => void;
  className?: string;
}) {
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<string | null>(null);

  const categories = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const asset of assets) {
      if (!seen.has(asset.category)) seen.set(asset.category, asset.categoryName);
    }
    return [...seen.entries()].map(([key, name]) => ({ key, name }));
  }, [assets]);

  const filtered = React.useMemo(() => {
    const needle = query.trim();
    return assets.filter((asset) => {
      if (category && asset.category !== category) return false;
      if (!needle) return true;
      return (
        asset.name.includes(needle) ||
        asset.categoryName.includes(needle)
      );
    });
  }, [assets, category, query]);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="shrink-0 space-y-3 px-1 pb-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-studio-ink/45"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="חיפוש פריט"
            aria-label="חיפוש בספריית הפריטים"
            className="border-studio-line bg-studio-2 pe-9 text-studio-ink placeholder:text-studio-ink/40 hover:border-studio-ink/50 focus:border-studio-ink focus-ring-invert"
          />
        </div>

        <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <Button
            size="sm"
            variant={category === null ? "studio" : "studioOutline"}
            aria-pressed={category === null}
            onClick={() => setCategory(null)}
            className="shrink-0 rounded-xs px-2.5 text-xs"
          >
            {t.common.viewAll}
          </Button>
          {categories.map((entry) => (
            <Button
              key={entry.key}
              size="sm"
              variant={category === entry.key ? "studio" : "studioOutline"}
              aria-pressed={category === entry.key}
              onClick={() => setCategory(entry.key)}
              className="shrink-0 rounded-xs px-2.5 text-xs"
            >
              {entry.name}
            </Button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1">
        {filtered.length === 0 ? (
          <EmptyState
            tone="studio"
            icon={<Search />}
            title="לא נמצאו פריטים"
            body="נסו מונח אחר, או העלו תמונה של מוצר משלכם."
            action={
              <Button variant="studioOutline" onClick={onUploadOwn}>
                העלאת מוצר משלי
              </Button>
            }
          />
        ) : (
          <ul className="grid grid-cols-3 gap-2 pb-2 sm:grid-cols-4 lg:grid-cols-3">
            {filtered.map((asset, index) => (
              <li key={asset.id}>
                <button
                  type="button"
                  data-testid="library-asset"
                  data-asset-category={asset.category}
                  onClick={() => onAdd(asset)}
                  style={{ "--enter-index": index } as React.CSSProperties}
                  className="enter-item press group flex w-full flex-col gap-1.5 rounded-sm border border-studio-line bg-studio-2 p-2 text-start focus-ring-invert hover:border-studio-ink/50"
                >
                  <span className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xs bg-studio-3/60">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset.assetUrl}
                      alt=""
                      loading="lazy"
                      className="max-h-[82%] max-w-[82%] object-contain"
                    />
                    <Plus
                      className="absolute end-1 top-1 size-3.5 text-studio-ink/50"
                      aria-hidden
                    />
                  </span>
                  <span className="line-clamp-2 text-[0.6875rem] leading-tight text-studio-ink">
                    {asset.name}
                  </span>
                  <span className="num text-[0.625rem] text-studio-ink/50">
                    {asset.realWidthCm}×{asset.realHeightCm} ס״מ
                  </span>
                  {asset.soldOnSite && asset.price !== null ? (
                    <Badge variant="brass" className="w-fit">
                      {formatPrice(asset.price)}
                    </Badge>
                  ) : (
                    <span className="flex w-fit items-center gap-1 text-[0.5625rem] text-studio-ink/45">
                      <Info className="size-2.5" aria-hidden />
                      {t.designer.illustrationOnly}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-studio-line px-1 pt-3">
        <Button variant="studioOutline" block onClick={onUploadOwn}>
          העלאת מוצר משלי
        </Button>
        <p className="mt-2 text-[0.625rem] leading-relaxed text-studio-ink/45">
          פריטים המסומנים כ״להמחשה בלבד״ אינם נמכרים באתר ואינם ניתנים להוספה לסל.
          הם מוצגים כדי לעזור לכם לראות את החלל.
        </p>
      </div>
    </div>
  );
}
