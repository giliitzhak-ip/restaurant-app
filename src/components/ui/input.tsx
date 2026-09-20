import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Text fields.
 *
 * The change worth knowing about: these used to carry `focus:outline-none`,
 * which switched off the brass focus ring the rest of the interface draws and
 * left a border darkening from #cec4b6 to #16130f as the only sign of where
 * you were. That is a colour-only indicator, and a weak one. The ring is back
 * — same ring as the buttons — and the border still firms up behind it.
 *
 * 44px tall, matching `Button size="md"`, so a field and the button beside it
 * line up without either being nudged at the call site.
 */

const fieldBase =
  "w-full rounded-sm border border-line-strong bg-surface text-sm text-ink interactive placeholder:text-muted-soft hover:border-muted-soft focus:border-ink aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = "text", ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(fieldBase, "h-11 px-3.5", className)}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, rows = 4, ...props }, ref) => (
  <textarea
    ref={ref}
    rows={rows}
    className={cn(fieldBase, "resize-y px-3.5 py-2.5 leading-relaxed", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { fieldBase };
