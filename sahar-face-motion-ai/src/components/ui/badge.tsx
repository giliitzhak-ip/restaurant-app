import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", {
  variants: {
    variant: {
      gold: "bg-gold/15 text-gold ring-1 ring-gold/30",
      success: "bg-success/15 text-success ring-1 ring-success/30",
      danger: "bg-danger/15 text-danger ring-1 ring-danger/30",
      muted: "bg-steel text-ash",
    },
  },
  defaultVariants: { variant: "muted" },
});

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
