import { ProductCard } from "@/features/catalog/product-card";
import type { Product } from "@/types/catalog";

/**
 * Horizontal rail on small screens, grid on large ones. Avoids a carousel
 * library: native scroll-snap is smoother and costs nothing.
 */
export function ProductRail({
  products,
  priority = false,
}: {
  products: Product[];
  priority?: boolean;
}) {
  if (!products.length) return null;

  return (
    <>
      <ul className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 md:hidden">
        {products.map((product, index) => (
          <li key={product.id} className="w-[64vw] shrink-0 snap-start sm:w-[42vw]">
            <ProductCard product={product} priority={priority && index === 0} />
          </li>
        ))}
      </ul>
      <ul className="hidden gap-x-6 gap-y-10 md:grid md:grid-cols-3 xl:grid-cols-4">
        {products.slice(0, 8).map((product, index) => (
          <li key={product.id}>
            <ProductCard
              product={product}
              priority={priority && index < 2}
              index={index}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
