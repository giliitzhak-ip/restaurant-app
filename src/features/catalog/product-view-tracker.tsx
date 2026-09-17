"use client";

import * as React from "react";
import { track } from "@/lib/analytics";
import type { Product } from "@/types/catalog";

/** Fires `view_product` once per product view. */
export function ProductViewTracker({ product }: { product: Product }) {
  React.useEffect(() => {
    track("view_product", {
      slug: product.slug,
      name: product.name,
      price: product.pricePerSqm ?? product.pricePerUnit,
      category: product.categorySlug,
    });
  }, [product.categorySlug, product.name, product.pricePerSqm, product.pricePerUnit, product.slug]);
  return null;
}
