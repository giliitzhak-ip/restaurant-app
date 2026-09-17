import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
  tone = "light",
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
  tone?: "light" | "studio";
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-14 text-center",
        tone === "light" ? "border-line-strong bg-surface" : "border-studio-line bg-studio-2",
        className,
      )}
    >
      {icon ? (
        <div
          className={cn(
            "mb-4 flex size-12 items-center justify-center rounded-full [&_svg]:size-5",
            tone === "light" ? "bg-surface-2 text-muted" : "bg-studio-3 text-studio-ink/70",
          )}
        >
          {icon}
        </div>
      ) : null}
      <h3
        className={cn(
          "text-lg",
          tone === "light" ? "text-ink" : "text-studio-ink",
        )}
      >
        {title}
      </h3>
      {body ? (
        <p
          className={cn(
            "mt-2 max-w-sm text-sm leading-relaxed",
            tone === "light" ? "text-muted" : "text-studio-ink/60",
          )}
        >
          {body}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
