"use client";

import { commerce } from "@/config/brand";
import { t } from "@/i18n";
import { formatArea, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Cart } from "@/types/commerce";

export function CartSummary({
  cart,
  className,
  children,
}: {
  cart: Cart;
  className?: string;
  children?: React.ReactNode;
}) {
  const { totals } = cart;

  return (
    <div className={cn("rounded-lg border border-line bg-surface p-5 md:p-6", className)}>
      <h2 className="text-lg">{t.checkout.summary}</h2>

      <dl className="mt-4 space-y-2.5 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted">{t.cart.subtotal}</dt>
          <dd className="num text-ink">{formatPrice(totals.subtotal)}</dd>
        </div>
        {totals.totalSqm > 0 ? (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted">{t.common.sqm}</dt>
            <dd className="num text-ink">{formatArea(totals.totalSqm)}</dd>
          </div>
        ) : null}
        {totals.discount > 0 ? (
          <div className="flex items-baseline justify-between gap-4 text-success">
            <dt>
              {t.cart.discount}
              {cart.couponCode ? ` · ${cart.couponCode}` : ""}
            </dt>
            <dd className="num">−{formatPrice(totals.discount)}</dd>
          </div>
        ) : null}
        {totals.installation > 0 ? (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted">{t.cart.installation}</dt>
            <dd className="num text-ink">{formatPrice(totals.installation)}</dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted">{t.cart.shipping}</dt>
          <dd className="num text-ink">
            {cart.fulfilment === "PICKUP" || totals.shipping === 0
              ? t.cart.shippingFree
              : formatPrice(totals.shipping)}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex items-baseline justify-between gap-4 border-t border-line pt-4">
        <span className="text-sm font-medium text-ink">{t.cart.total}</span>
        <span className="num font-display text-2xl text-ink" data-testid="cart-total">
          {formatPrice(totals.total)}
        </span>
      </div>
      {commerce.vatIncludedInPrices ? (
        <p className="mt-1 text-xs text-muted">{t.cart.vatNote}</p>
      ) : null}

      {totals.freeShippingRemaining > 0 && cart.fulfilment === "SHIPPING" ? (
        <div className="mt-4">
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full bg-brass transition-[width] duration-500"
              style={{
                width: `${Math.min(
                  100,
                  ((commerce.freeShippingThreshold - totals.freeShippingRemaining) /
                    commerce.freeShippingThreshold) *
                    100,
                )}%`,
              }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            {t.cart.freeShippingProgress(formatPrice(totals.freeShippingRemaining))}
          </p>
        </div>
      ) : null}

      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}
