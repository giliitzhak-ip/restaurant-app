import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-lg', className)} aria-hidden />
}

export function ProductCardSkeleton() {
  return (
    <div className="rounded-card border border-ink-200 bg-white p-3">
      <Skeleton className="aspect-square w-full rounded-xl" />
      <Skeleton className="mt-4 h-3 w-1/3" />
      <Skeleton className="mt-2 h-4 w-4/5" />
      <Skeleton className="mt-3 h-5 w-1/4" />
    </div>
  )
}
