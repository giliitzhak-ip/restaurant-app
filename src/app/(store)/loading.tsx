import { Skeleton } from "@/components/ui/skeleton";
import { ProductCardSkeleton } from "@/features/catalog/product-card";

/**
 * Route-level skeleton.
 *
 * It reuses the product card's own skeleton and the catalogue's own grid —
 * two columns on a phone, three from `md` — rather than a second description
 * of roughly the same shape. It used to say four columns, so every catalogue
 * load reflowed the moment the real products arrived, which is the one thing
 * a skeleton exists to prevent.
 */
export default function StoreLoading() {
  return (
    <div className="container-page py-10">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="mt-6 h-10 w-80" />
      <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 md:gap-x-6 md:gap-y-12">
        {Array.from({ length: 9 }).map((_, index) => (
          <ProductCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}
