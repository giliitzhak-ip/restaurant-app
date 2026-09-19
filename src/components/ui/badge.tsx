import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-xs px-2 py-0.5 text-[0.6875rem] font-medium tracking-[0.04em] whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "bg-surface-2 text-ink-soft",
        ink: "bg-ink text-canvas",
        outline: "border border-line-strong text-muted",
        brass: "bg-brass-wash text-brass-ink",
        success: "bg-[#e9f0ea] text-success",
        warning: "bg-[#f6efe0] text-warning",
        danger: "bg-[#f7e9e7] text-danger",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
