import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldBase } from "@/components/ui/input";

/**
 * A plain `<select>`, styled like the rest of the fields.
 *
 * Distinct from the Radix `Select` on purpose. Where the list is short and
 * the control is one of many in a dense row — the catalogue sort, an admin
 * status cell, an alt-text language — the native picker is the better one: it
 * opens as the platform's own wheel on a phone, needs no portal, and costs
 * nothing in JavaScript. Four places had each rebuilt it with slightly
 * different heights and each had switched off its focus ring.
 */
export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { size2?: "sm" | "md" }
>(({ className, size2 = "md", children, ...props }, ref) => (
  <div className="relative inline-flex w-full">
    <select
      ref={ref}
      className={cn(
        fieldBase,
        "appearance-none",
        size2 === "sm" ? "h-9 ps-2.5 pe-8 text-xs" : "h-11 ps-3.5 pe-9",
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      aria-hidden
      className="pointer-events-none absolute end-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
    />
  </div>
));
NativeSelect.displayName = "NativeSelect";
