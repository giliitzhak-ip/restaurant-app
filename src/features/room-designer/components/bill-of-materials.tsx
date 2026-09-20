"use client";

import { Info } from "lucide-react";
import { t } from "@/i18n";
import { formatArea, formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import type { ProductSwatch } from "@/types/catalog";
import type { SceneObject } from "@/types/scene";

/**
 * What is in this design.
 *
 * Two lists that are deliberately not merged, because they are two different
 * kinds of thing. The claddings are real products, priced by the area the
 * customer marked. The objects are only priced when an administrator has
 * linked them to a catalogue row; everything else is a drawing that helps
 * them picture the room, and it says so on its own line rather than being
 * quietly dropped from the total.
 *
 * Hiding the illustrations would be tidier and worse: someone looking at a
 * media wall with a bar and a wine fridge in it needs to know which of those
 * they are about to be charged for.
 */
export function BillOfMaterials({
  claddings,
  objects,
  totalAreaSqm,
  totalPrice,
}: {
  claddings: { swatch: ProductSwatch; areaSqm: number }[];
  objects: SceneObject[];
  totalAreaSqm: number;
  totalPrice: number;
}) {
  const sellable = objects.filter((object) => object.productId);
  const illustrations = objects.filter((object) => !object.productId);

  if (!claddings.length && !objects.length) {
    return (
      <p className="text-[0.6875rem] text-studio-ink/45">
        בחרו חיפוי או הוסיפו פריטים כדי לראות את רשימת העיצוב.
      </p>
    );
  }

  return (
    <div className="space-y-4" data-testid="bill-of-materials">
      {claddings.length ? (
        <section>
          <h4 className="mb-1.5 text-[0.6875rem] tracking-[0.18em] text-studio-ink/50">
            חיפויים
          </h4>
          <ul className="space-y-1">
            {claddings.map(({ swatch, areaSqm }) => (
              <li
                key={swatch.id}
                className="flex items-baseline justify-between gap-2 text-[0.6875rem]"
              >
                <span className="truncate text-studio-ink">{swatch.name}</span>
                <span className="num shrink-0 text-studio-ink/60">
                  {formatArea(areaSqm)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {sellable.length ? (
        <section>
          <h4 className="mb-1.5 text-[0.6875rem] tracking-[0.18em] text-studio-ink/50">
            מוצרים הנמכרים באתר
          </h4>
          <ul className="space-y-1">
            {sellable.map((object) => (
              <li
                key={object.id}
                className="flex items-baseline justify-between gap-2 text-[0.6875rem]"
              >
                <span className="truncate text-studio-ink">{object.label}</span>
                <Badge variant="brass" className="shrink-0">
                  ניתן להוספה לסל
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {illustrations.length ? (
        <section>
          <h4 className="mb-1.5 flex items-center gap-1 text-[0.6875rem] tracking-[0.18em] text-studio-ink/50">
            <Info className="size-3" aria-hidden />
            {t.designer.illustrationOnly}
          </h4>
          <ul className="space-y-1">
            {illustrations.map((object) => (
              <li
                key={object.id}
                className="truncate text-[0.6875rem] text-studio-ink/55"
              >
                {object.label}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[0.625rem] leading-relaxed text-studio-ink/40">
            הפריטים האלה אינם נמכרים באתר ואינם נכללים במחיר. הם מוצגים כדי לעזור
            לראות את החלל.
          </p>
        </section>
      ) : null}

      <div className="flex items-baseline justify-between gap-2 border-t border-studio-line pt-2.5">
        <span className="text-[0.6875rem] text-studio-ink/60">
          {t.designer.estimatedPrice}
        </span>
        <span className="num text-sm text-studio-ink">{formatPrice(totalPrice)}</span>
      </div>
      <p className="num text-[0.625rem] text-studio-ink/40">
        {t.designer.estimatedArea}: {formatArea(totalAreaSqm)}
      </p>
    </div>
  );
}
