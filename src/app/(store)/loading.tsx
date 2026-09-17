import { Skeleton } from "@/components/ui/skeleton";

/** Route-level skeleton: keeps layout stable while a page streams in. */
export default function StoreLoading() {
  return (
    <div className="container-page py-10">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="mt-6 h-10 w-80" />
      <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index}>
            <Skeleton className="aspect-4/5 w-full" />
            <Skeleton className="mt-3 h-4 w-3/4" />
            <Skeleton className="mt-2 h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
