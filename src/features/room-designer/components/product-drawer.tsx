"use client";

import * as React from "react";
import Image from "next/image";
import { Check } from "lucide-react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import type { ProductSwatch } from "@/types/catalog";

type FilterKey =
  | "all"
  | "LIGHT"
  | "DARK"
  | "NATURAL"
  | "WARM"
  | "COLD"
  | "WOOD"
  | "STONE"
  | "CONCRETE";

const filters: { key: FilterKey; label: string }[] = [
  { key: "all", label: t.common.viewAll },
  { key: "LIGHT", label: t.designer.filterLight },
  { key: "DARK", label: t.designer.filterDark },
  { key: "NATURAL", label: t.designer.filterNatural },
  { key: "WARM", label: t.designer.filterWarm },
  { key: "COLD", label: t.designer.filterCold },
  { key: "WOOD", label: t.designer.filterWood },
  { key: "STONE", label: t.designer.filterStone },
  { key: "CONCRETE", label: t.designer.filterConcrete },
];

/**
 * Swatch drawer.
 *
 * Switching product is one tap and never leaves the room — that is the whole
 * point of the feature, so the drawer stays on screen while the render
 * updates behind it.
 */
export function ProductDrawer({
  swatches,
  surfaceKind,
  selectedId,
  onSelect,
}: {
  swatches: ProductSwatch[];
  surfaceKind: "FLOOR" | "WALL" | "CEILING";
  selectedId: string | null;
  onSelect: (productId: string) => void;
}) {
  const [filter, setFilter] = React.useState<FilterKey>("all");

  const forSurface = React.useMemo(
    () =>
      swatches.filter((swatch) =>
        surfaceKind === "WALL"
          ? swatch.surface === "WALL" || swatch.surface === "BOTH"
          : swatch.surface === "FLOOR" || swatch.surface === "BOTH",
      ),
    [surfaceKind, swatches],
  );

  const filtered = React.useMemo(() => {
    if (filter === "all") return forSurface;
    if (filter === "WOOD") {
      return forSurface.filter(
        (swatch) =>
          swatch.material === "WOOD" ||
          swatch.material === "SPC" ||
          swatch.material === "LAMINATE" ||
          swatch.material === "MDF",
      );
    }
    if (filter === "STONE") {
      return forSurface.filter((swatch) => swatch.material === "STONE");
    }
    if (filter === "CONCRETE") {
      return forSurface.filter((swatch) => swatch.material === "CONCRETE");
    }
    return forSurface.filter((swatch) => swatch.tone === filter);
  }, [filter, forSurface]);

  return (
    <div>
      <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2">
        {filters.map((entry) => (
          <Button
            key={entry.key}
            size="sm"
            /*
             * A filter that is on is a pressed toggle, not a differently
             * coloured button. aria-pressed says so; the fill only shows it.
             */
            aria-pressed={filter === entry.key}
            variant={filter === entry.key ? "studio" : "studioOutline"}
            onClick={() => setFilter(entry.key)}
            className="shrink-0 rounded-xs px-2.5 text-xs"
          >
            {entry.label}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-xs text-studio-ink/50">
          {t.catalog.noResultsTitle}
        </p>
      ) : (
        <ul className="scrollbar-none -mx-1 flex gap-2.5 overflow-x-auto px-1 py-2 lg:grid lg:max-h-[22rem] lg:grid-cols-3 lg:overflow-y-auto">
          {filtered.map((swatch) => {
            const selected = swatch.id === selectedId;
            return (
              <li key={swatch.id} className="w-24 shrink-0 lg:w-auto">
                <button
                  type="button"
                  data-testid="designer-swatch"
                  onClick={() => onSelect(swatch.id)}
                  aria-pressed={selected}
                  className={cn(
                    "press group block w-full text-start focus-ring-invert",
                    selected ? "opacity-100" : "opacity-90 hover:opacity-100",
                  )}
                >
                  <span
                    className={cn(
                      "relative block aspect-square w-full overflow-hidden rounded-sm border-2 interactive",
                      selected ? "border-studio-ink" : "border-transparent",
                    )}
                  >
                    <Image
                      src={swatch.thumbnailUrl}
                      alt=""
                      fill
                      sizes="96px"
                      className="object-cover"
                    />
                    {selected ? (
                      <span className="absolute end-1 top-1 flex size-5 items-center justify-center rounded-full bg-studio-ink text-studio">
                        <Check className="size-3" />
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1.5 block truncate text-[0.6875rem] leading-tight text-studio-ink">
                    {swatch.name}
                  </span>
                  <span className="num block text-[0.625rem] text-studio-ink/50">
                    {swatch.pricePerSqm
                      ? `${formatPrice(swatch.pricePerSqm)} ${t.common.perSqm}`
                      : formatPrice(swatch.pricePerUnit)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
