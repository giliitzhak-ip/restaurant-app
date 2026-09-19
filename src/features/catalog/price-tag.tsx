import { formatArea, formatPrice } from "@/lib/format";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/catalog";

/**
 * Surfaces are bought by the square metre but sold by the package, so both
 * numbers are always shown — that is the single biggest source of confusion
 * in this category.
 */
export function PriceTag({
  product,
  size = "md",
  className,
}: {
  product: Pick<
    Product,
    "pricePerSqm" | "pricePerUnit" | "packageCoverageSqm" | "compareAtPrice" | "pricingUnit"
  >;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const hasSqm = product.pricePerSqm !== null;
  const primary = hasSqm ? product.pricePerSqm! : product.pricePerUnit;
  const unitLabel = hasSqm
    ? t.common.perSqm
    : product.pricingUnit === "PACKAGE"
      ? "לחבילה"
      : "ליחידה";

  return (
    <div className={cn("flex flex-col gap-0.5", className)} data-testid="price-per-unit">
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "num font-display text-ink",
            size === "sm" && "text-base",
            size === "md" && "text-xl",
            size === "lg" && "text-3xl",
          )}
        >
          {formatPrice(primary)}
        </span>
        <span
          className={cn(
            "text-muted",
            size === "lg" ? "text-sm" : "text-xs",
          )}
        >
          {unitLabel}
        </span>
        {product.compareAtPrice && product.compareAtPrice > product.pricePerUnit ? (
          <span className="num text-xs text-muted line-through">
            {formatPrice(product.compareAtPrice)}
          </span>
        ) : null}
      </div>
      {hasSqm && product.packageCoverageSqm ? (
        <span className="num text-xs text-muted">
          {formatPrice(product.pricePerUnit)} לחבילה ·{" "}
          {formatArea(product.packageCoverageSqm)}
        </span>
      ) : null}
    </div>
  );
}
