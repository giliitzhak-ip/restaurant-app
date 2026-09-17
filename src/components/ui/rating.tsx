import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function Rating({
  value,
  count,
  size = "sm",
  className,
}: {
  value: number;
  count?: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const rounded = Math.round(value);
  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      aria-label={`דירוג ${value} מתוך 5`}
    >
      <div className="flex" aria-hidden>
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              size === "sm" ? "size-3.5" : "size-4",
              star <= rounded
                ? "fill-brass text-brass"
                : "fill-transparent text-line-strong",
            )}
          />
        ))}
      </div>
      {count !== undefined ? (
        <span className="num text-xs text-muted">({count})</span>
      ) : null}
    </div>
  );
}
