import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = "text", ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      "h-11 w-full rounded-sm border border-line-strong bg-surface px-3.5 text-sm text-ink transition-colors placeholder:text-muted-soft hover:border-muted-soft focus:border-ink focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-2 aria-[invalid=true]:border-danger",
      className,
    )}
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
    className={cn(
      "w-full resize-y rounded-sm border border-line-strong bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-ink transition-colors placeholder:text-muted-soft hover:border-muted-soft focus:border-ink focus:outline-none aria-[invalid=true]:border-danger",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
