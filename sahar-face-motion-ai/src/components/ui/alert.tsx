import * as React from "react";
import { cn } from "@/lib/utils";

export function Alert({
  variant = "danger",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: "danger" | "info" }) {
  return (
    <div
      role={variant === "danger" ? "alert" : "status"}
      className={cn(
        "rounded-xl px-4 py-3 text-sm leading-relaxed",
        variant === "danger" ? "bg-danger/10 text-danger ring-1 ring-danger/30" : "bg-gold/10 text-gold ring-1 ring-gold/30",
        className,
      )}
      {...props}
    />
  );
}
