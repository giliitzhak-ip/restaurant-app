"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Ruler, ShoppingBag, Sparkles, Trash2 } from "lucide-react";
import { commerce } from "@/config/brand";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { formatArea, formatPrice } from "@/lib/format";
import { track } from "@/lib/analytics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { CartSummary } from "@/features/cart/cart-summary";
import { useCart } from "@/features/cart/cart-provider";

export function CartView() {
  const { cart, pending, setUnits, remove, applyCoupon, setInstallation, setFulfilment } =
    useCart();
  const [coupon, setCoupon] = React.useState("");

  if (!cart.items.length) {
    return (
      <EmptyState
        icon={<ShoppingBag />}
        title={t.cart.empty}
        body={t.cart.emptyBody}
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild>
              <Link href={routes.catalog}>{t.cart.emptyCta}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={routes.designer}>
                <Sparkles />
                {t.designer.shortTitle}
              </Link>
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr] lg:gap-14">
      <div>
        <ul className="divide-y divide-line border-y border-line">
          {cart.items.map((item) => (
            <li key={item.id} className="flex gap-4 py-5">
              <Link
                href={routes.product(item.productSlug)}
                className="relative size-24 shrink-0 overflow-hidden rounded-sm bg-surface-2 sm:size-28"
              >
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt={item.name}
                    fill
                    sizes="112px"
                    className="object-cover"
                  />
                ) : null}
              </Link>

              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={routes.product(item.productSlug)}
                      className="link-quiet text-[0.9375rem] font-medium text-ink"
                    >
                      {item.name}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-muted">{item.subtitle}</p>
                    {item.designLabel ? (
                      <Badge variant="brass" className="mt-1.5">
                        {t.cart.fromDesign}: {item.designLabel}
                      </Badge>
                    ) : null}
                  </div>
                  <IconButton
                    size="iconSm"
                    label={`${t.common.remove} ${item.name}`}
                    onClick={() => remove(item.id, item.productSlug)}
                    className="shrink-0 text-muted hover:text-danger"
                  >
                    <Trash2 />
                  </IconButton>
                </div>

                <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <QuantityStepper
                      value={item.units}
                      onChange={(units) => setUnits(item.id, units)}
                      label={
                        item.pricingUnit === "PACKAGE"
                          ? t.cart.packagesLabel
                          : t.common.units
                      }
                    />
                    {item.coveredSqm ? (
                      <p className="num mt-1.5 text-xs text-muted">
                        {formatArea(item.coveredSqm)}
                        {item.requestedSqm
                          ? ` · לפי חישוב ${formatArea(item.requestedSqm)}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-end">
                    <p className="num font-display text-lg text-ink">
                      {formatPrice(item.lineTotal)}
                    </p>
                    <p className="num text-xs text-muted">
                      {formatPrice(item.unitPrice)} ×{item.units}
                    </p>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href={routes.catalog}
            className="link-quiet inline-flex items-center gap-1.5 text-sm text-ink"
          >
            {t.cart.continueShopping}
            <ArrowLeft className="size-4" />
          </Link>
        </div>

        {/* delivery */}
        <fieldset className="mt-10">
          <legend className="text-sm font-medium text-ink">{t.checkout.delivery}</legend>
          <RadioGroup
            value={cart.fulfilment}
            onValueChange={(value) =>
              setFulfilment(value as "SHIPPING" | "PICKUP")
            }
            className="mt-3 gap-2 sm:grid-cols-2"
          >
            <RadioCard
              value="SHIPPING"
              title={t.checkout.shippingOption}
              description="2–5 ימי עסקים · חינם מעל 4,500 ₪"
              meta={
                cart.totals.shipping === 0
                  ? t.cart.shippingFree
                  : formatPrice(commerce.shippingFlatRate)
              }
            />
            <RadioCard
              value="PICKUP"
              title={t.checkout.pickupOption}
              description="מוכן לאיסוף בתוך 24 שעות"
              meta={t.cart.shippingFree}
            />
          </RadioGroup>
        </fieldset>

        {/* installation */}
        {commerce.installationPricePerSqm ? (
          <div className="mt-6 flex items-start gap-4 card p-5">
            <Ruler className="mt-0.5 size-5 shrink-0 text-brass" />
            <div className="flex-1">
              <p className="text-sm font-medium text-ink">
                {t.cart.installationQuestion}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {t.cart.installationBody(
                  formatPrice(commerce.installationPricePerSqm),
                )}
              </p>
            </div>
            <Switch
              checked={cart.installation}
              onCheckedChange={(checked) =>
                setInstallation(checked, cart.totals.totalSqm)
              }
              aria-label={t.cart.installationQuestion}
            />
          </div>
        ) : null}
      </div>

      <div className="lg:sticky lg:top-24 lg:h-fit">
        <CartSummary cart={cart}>
          <div className="space-y-3">
            <form
              className="flex gap-2"
              onSubmit={async (event) => {
                event.preventDefault();
                const ok = await applyCoupon(coupon);
                if (ok) setCoupon("");
              }}
            >
              <Input
                value={coupon}
                onChange={(event) => setCoupon(event.target.value)}
                placeholder={t.cart.coupon}
                aria-label={t.cart.coupon}
                className="h-11"
              />
              <Button type="submit" variant="outline" loading={pending}>
                {t.cart.couponApply}
              </Button>
            </form>

            <Button
              asChild
              block
              size="lg"
              onClick={() =>
                track("begin_checkout", {
                  value: cart.totals.total,
                  items: cart.totals.itemCount,
                })
              }
            >
              <Link href={routes.checkout}>{t.cart.checkout}</Link>
            </Button>
            <Button asChild variant="outline" block>
              <Link href={routes.quote}>{t.product.requestQuote}</Link>
            </Button>
          </div>
        </CartSummary>
      </div>
    </div>
  );
}
