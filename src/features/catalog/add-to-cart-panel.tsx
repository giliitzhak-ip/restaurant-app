"use client";

import * as React from "react";
import Link from "next/link";
import { Heart, Package, Sparkles } from "lucide-react";
import { routes } from "@/config/site";
import { commerce } from "@/config/brand";
import { t } from "@/i18n";
import { formatPrice } from "@/lib/format";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { useCart } from "@/features/cart/cart-provider";
import { useFavorites } from "@/features/catalog/favorites-provider";
import { useToast } from "@/components/ui/toast";
import type { Product } from "@/types/catalog";

export function AddToCartPanel({ product }: { product: Product }) {
  const [units, setUnits] = React.useState(1);
  const { add, pending } = useCart();
  const { isFavorite, toggle } = useFavorites();
  const { toast } = useToast();
  const soldOut = product.availability === "OUT_OF_STOCK";
  const favorite = isFavorite(product.id);

  if (product.quoteOnly) {
    return (
      <div className="space-y-3">
        <Button asChild block size="lg">
          <Link href={routes.quoteForProduct(product.slug)}>
            {t.product.requestQuote}
          </Link>
        </Button>
        <p className="text-xs text-muted">
          המוצר הזה מתומחר לפי פרויקט — נשלח הצעה מדויקת לפי מ״ר ולוח זמנים.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-stretch gap-2">
        <QuantityStepper
          value={units}
          onChange={setUnits}
          label={
            product.pricingUnit === "PACKAGE" ? t.cart.packagesLabel : t.common.units
          }
          className="h-13 shrink-0"
        />
        <Button
          block
          size="lg"
          disabled={soldOut || pending}
          onClick={() =>
            add({
              productId: product.id,
              slug: product.slug,
              name: product.name,
              units,
            })
          }
        >
          {soldOut ? t.common.outOfStock : t.product.addToCart}
        </Button>
      </div>

      {product.packageCoverageSqm ? (
        <p className="num text-xs text-muted">
          {units} × {product.packageCoverageSqm} מ״ר ={" "}
          {(units * product.packageCoverageSqm).toFixed(2)} מ״ר ·{" "}
          {formatPrice(units * product.pricePerUnit)}
        </p>
      ) : null}

      <div className="flex gap-2">
        {product.texture ? (
          <Button asChild variant="outline" size="lg" className="flex-1">
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
        <Button
          variant="outline"
          size="lg"
          aria-pressed={favorite}
          aria-label={favorite ? t.catalog.removeFavorite : t.catalog.addFavorite}
          onClick={() => toggle(product.id)}
          className="shrink-0 px-4"
        >
          <Heart className={favorite ? "fill-clay text-clay" : undefined} />
        </Button>
      </div>

      {product.sampleAvailable ? (
        <Button
          variant="subtle"
          block
          onClick={async () => {
            track("order_sample", { slug: product.slug });
            toast({
              title: "הדוגמה נוספה לסל",
              description: `${product.name} · ${formatPrice(commerce.samplePrice)} — מוחזר במלואו בהזמנה`,
              action: { label: t.cart.checkout, href: routes.cart },
            });
            await add({
              productId: product.id,
              slug: product.slug,
              name: product.name,
              units: 1,
              sample: true,
              silent: true,
            });
          }}
        >
          <Package />
          {t.product.orderSample} · {formatPrice(commerce.samplePrice)}
        </Button>
      ) : null}

      <p className="text-center text-xs text-muted">
        <Link href={routes.quoteForProduct(product.slug)} className="link-quiet">
          {t.product.requestQuote}
        </Link>
        {" · "}
        <Link href={routes.shipping} className="link-quiet">
          משלוחים והחזרות
        </Link>
      </p>
    </div>
  );
}
