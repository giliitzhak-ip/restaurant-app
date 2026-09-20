"use client";

import * as React from "react";
import { Package } from "lucide-react";
import { commerce } from "@/config/brand";
import { t } from "@/i18n";
import { formatArea, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { useCart } from "@/features/cart/cart-provider";
import type { Product } from "@/types/catalog";

/**
 * Mobile purchase bar.
 *
 * On a phone the buy box scrolls away within a screen and a half, and from
 * then on the page is specifications and photography with no way to buy. The
 * bar keeps the three things a decision needs — what it costs, whether it is
 * in stock, and the button — within thumb reach for the rest of the page.
 *
 * It appears only once the real buy box has scrolled out of view, so the two
 * are never on screen together competing for the same tap.
 */
export function StickyBuyBar({
  product,
  anchorId,
}: {
  product: Product;
  /** Element whose visibility decides whether the bar is needed. */
  anchorId: string;
}) {
  const { add, pending } = useCart();
  const [showing, setShowing] = React.useState(false);

  React.useEffect(() => {
    const anchor = document.getElementById(anchorId);
    if (!anchor || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Only show it once the buy box is fully gone, and only upwards: a bar
        // that flickers in and out on every small scroll is worse than none.
        setShowing(Boolean(entry && !entry.isIntersecting && entry.boundingClientRect.top < 0));
      },
      { rootMargin: "0px 0px -20% 0px", threshold: 0 },
    );
    observer.observe(anchor);
    return () => observer.disconnect();
  }, [anchorId]);

  /*
   * While the bar is up it reserves its own height at the bottom of the
   * viewport, and the toast stack reads that as `--toast-offset`. Without it
   * a confirmation ("added to your basket") lands exactly on top of the
   * button that produced it, on the one screen size where there is no room
   * for both.
   */
  React.useEffect(() => {
    const root = document.documentElement;
    if (!showing) {
      root.style.removeProperty("--toast-offset");
      return;
    }
    root.style.setProperty("--toast-offset", "4.25rem");
    return () => {
      root.style.removeProperty("--toast-offset");
    };
  }, [showing]);

  const soldOut = product.availability === "OUT_OF_STOCK";
  const perSqm = product.pricePerSqm;

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md md:hidden",
        "transition-transform duration-[var(--dur-enter)] ease-[var(--ease-out-soft)]",
        "pb-[env(safe-area-inset-bottom,0px)]",
        showing ? "translate-y-0" : "translate-y-full",
      )}
      /*
       * `inert` rather than `aria-hidden`: the bar stays mounted so it can
       * slide, and aria-hidden over focusable buttons is itself a WCAG failure
       * (a keyboard lands on a control screen readers were told is not there).
       * inert removes it from both the tab order and the accessibility tree.
       */
      inert={!showing}
    >
      <div className="container-page flex items-center gap-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="num text-[0.9375rem] font-medium text-ink">
            {formatPrice(perSqm ?? product.pricePerUnit)}
            <span className="ms-1 text-xs font-normal text-muted">
              {perSqm ? t.common.perSqm : product.pricingUnit === "PACKAGE" ? "לחבילה" : "ליחידה"}
            </span>
          </p>
          <p className="num truncate text-[0.6875rem] text-muted">
            {product.packageCoverageSqm
              ? `${formatPrice(product.pricePerUnit)} לחבילה · ${formatArea(product.packageCoverageSqm)}`
              : product.name}
          </p>
        </div>

        {product.sampleAvailable && !soldOut ? (
          <IconButton
            variant="outline"
            size="icon"
            className="shrink-0"
            label={`${t.product.orderSample} · ${formatPrice(commerce.samplePrice)}`}
            onClick={() =>
              add({
                productId: product.id,
                slug: product.slug,
                name: product.name,
                units: 1,
                sample: true,
              })
            }
          >
            <Package />
          </IconButton>
        ) : null}

        <Button
          size="md"
          className="shrink-0 px-5"
          data-testid="sticky-add-to-cart"
          disabled={soldOut}
          loading={pending}
          onClick={() =>
            add({
              productId: product.id,
              slug: product.slug,
              name: product.name,
              units: 1,
            })
          }
        >
          {soldOut ? t.common.outOfStock : t.product.addToCart}
        </Button>
      </div>
    </div>
  );
}
