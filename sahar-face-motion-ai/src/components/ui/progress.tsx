import { cn } from "@/lib/utils";

export function Progress({ value, className, label }: { value: number; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-steel", className)}
    >
      <div className="h-full rounded-full bg-gradient-to-l from-gold-light to-gold-dark transition-[width] duration-300" style={{ width: `${v}%` }} />
    </div>
  );
}
