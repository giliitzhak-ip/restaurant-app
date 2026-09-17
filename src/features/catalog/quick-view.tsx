"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { blurDataUrl } from "@/lib/media";
import { track } from "@/lib/analytics";
import { formatThickness } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { AvailabilityBadge } from "@/features/catalog/availability-badge";
import { PriceTag } from "@/features/catalog/price-tag";
import { useCart } from "@/features/cart/cart-provider";
import type { Product } from "@/types/catalog";

export function QuickView({
  product,
  open,
  onOpenChange,
}: {
  product: Product;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const [units, setUnits] = React.useState(1);
  const { add, pending } = useCart();
  const image = product.images.find((entry) => entry.kind === "ROOM") ?? product.images[0];
  const soldOut = product.availability === "OUT_OF_STOCK";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="p-0 sm:max-w-3xl">
        <div className="grid sm:grid-cols-2">
          <div className="relative aspect-[4/3] bg-surface-2 sm:aspect-auto sm:min-h-[26rem]">
            {image ? (
              <Image
                src={image.url}
                alt={image.alt}
                fill
                sizes="(max-width: 640px) 100vw, 400px"
                placeholder="blur"
                blurDataURL={blurDataUrl}
                className="object-cover"
              />
            ) : null}
          </div>

          <div className="p-6">
            <p className="eyebrow">{product.categoryName}</p>
            <DialogTitle className="mt-2 text-2xl">{product.name}</DialogTitle>
            <p className="mt-1 text-sm text-muted">{product.subtitle}</p>

            <PriceTag product={product} size="md" className="mt-4" />

            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2.5 border-y border-line py-4 text-xs">
              <div>
                <dt className="text-muted">{t.product.material}</dt>
                <dd className="mt-0.5 text-ink">{product.specs.materialLabel}</dd>
              </div>
              <div>
                <dt className="text-muted">{t.product.thickness}</dt>
                <dd className="num mt-0.5 text-ink">
                  {formatThickness(product.specs.thicknessMm)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">{t.product.tone}</dt>
                <dd className="mt-0.5 text-ink">{product.specs.colorName}</dd>
              </div>
              <div>
                <dt className="text-muted">{t.product.warranty}</dt>
                <dd className="num mt-0.5 text-ink">
                  {product.specs.warrantyYears} שנים
                </dd>
              </div>
            </dl>

            <div className="mt-4">
              <AvailabilityBadge
                availability={product.availability}
                leadTimeDays={product.leadTimeDays}
              />
            </div>

            {product.quoteOnly ? (
              <Button asChild block className="mt-5">
                <Link href={routes.quoteForProduct(product.slug)}>
                  {t.product.requestQuote}
                </Link>
              </Button>
            ) : (
              <div className="mt-5 flex items-center gap-2">
                <QuantityStepper
                  value={units}
                  onChange={setUnits}
                  label={t.cart.packagesLabel}
                />
                <Button
                  block
                  disabled={soldOut || pending}
                  onClick={async () => {
                    const ok = await add({
                      productId: product.id,
                      slug: product.slug,
                      name: product.name,
                      units,
                    });
                    if (ok) onOpenChange(false);
                  }}
                >
                  {soldOut ? t.common.outOfStock : t.product.addToCart}
                </Button>
              </div>
            )}

            <div className="mt-3 flex flex-col gap-2">
              {product.texture ? (
                <Button asChild variant="outline" block>
                  <Link
                    href={routes.designerWithProduct(
                      product.slug,
                      product.specs.surface === "WALL" ? "wall" : "floor",
                    )}
                    onClick={() => track("start_room_designer", { entry: "product" })}
                  >
                    <Sparkles />
                    {t.product.seeInMyRoom}
                  </Link>
                </Button>
              ) : null}
              <Link
                href={routes.product(product.slug)}
                className="link-quiet inline-flex items-center gap-1.5 self-start text-sm text-ink"
              >
                לעמוד המוצר המלא
                <ArrowLeft className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
