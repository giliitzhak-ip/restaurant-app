import { cn } from '@/lib/cn';

/** GET SERVICE wordmark. Latin, so it stays LTR inside the RTL layout. */
export function Logo({ className, showTagline = false }: { className?: string; showTagline?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      <div className="flex items-center gap-2" dir="ltr">
        <span aria-hidden="true" className="relative flex size-3">
          <span className="gs-pulse-ring absolute inline-flex size-3 rounded-full bg-accent-400" />
          <span className="relative inline-flex size-3 rounded-full bg-accent-500" />
        </span>
        <span className="text-2xl font-black tracking-tight text-white">
          GET<span className="text-accent-400">SERVICE</span>
        </span>
      </div>
      {showTagline && (
        <p className="text-sm font-medium text-slate-400">צריך? אנחנו מוצאים.</p>
      )}
    </div>
  );
}
