"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/icon-button";

/**
 * Side / bottom sheet. Mobile flows use `side="bottom"` everywhere instead of
 * centred modals — it keeps the thumb reach short and the photo visible.
 */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

type SheetSide = "bottom" | "start" | "end";

const sideClasses: Record<SheetSide, string> = {
  bottom:
    "inset-x-0 bottom-0 max-h-[86dvh] rounded-t-xl border-t animate-[enter-sheet_var(--dur-enter)_var(--ease-out-soft)_both] data-[state=closed]:animate-[exit-sheet_var(--dur-gentle)_var(--ease-out-soft)_forwards]",
  start:
    "inset-y-0 start-0 h-dvh w-[min(22rem,88vw)] border-e [--sheet-from:-100%] rtl:[--sheet-from:100%] animate-[enter-slide_var(--dur-enter)_var(--ease-out-soft)_both] data-[state=closed]:animate-[exit-slide_var(--dur-gentle)_var(--ease-out-soft)_forwards]",
  end: "inset-y-0 end-0 h-dvh w-[min(26rem,92vw)] border-s [--sheet-from:100%] rtl:[--sheet-from:-100%] animate-[enter-slide_var(--dur-enter)_var(--ease-out-soft)_both] data-[state=closed]:animate-[exit-slide_var(--dur-gentle)_var(--ease-out-soft)_forwards]",
};

export const SheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    side?: SheetSide;
    theme?: "light" | "studio";
    hideClose?: boolean;
  }
>(
  (
    { className, children, side = "bottom", theme = "light", hideClose, ...props },
    ref,
  ) => (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_var(--dur-enter)_var(--ease-out-soft)_both] data-[state=closed]:animate-[fade-in_var(--dur-gentle)_var(--ease-out-soft)_reverse_forwards]" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden shadow-sheet",
          theme === "light"
            ? "border-line bg-surface text-ink"
            : "border-studio-line bg-studio-2 text-studio-ink",
          sideClasses[side],
          className,
        )}
        {...props}
      >
        {side === "bottom" ? (
          <div className="flex justify-center pt-2.5" aria-hidden>
            <span
              className={cn(
                "h-1 w-10 rounded-full",
                theme === "light" ? "bg-line-strong" : "bg-studio-line",
              )}
            />
          </div>
        ) : null}
        {children}
        {!hideClose ? (
          <DialogPrimitive.Close asChild>
            <IconButton
              label="סגירה"
              size="iconSm"
              className={cn(
                "absolute end-4 top-4",
                theme === "light"
                  ? "text-muted"
                  : "text-studio-ink/60 focus-ring-invert hover:bg-white/10 hover:text-studio-ink",
              )}
            >
              <X />
            </IconButton>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  ),
);
SheetContent.displayName = "SheetContent";

export function SheetHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("shrink-0 border-b border-inherit px-5 py-4 pe-12", className)}
      {...props}
    />
  );
}

export const SheetTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg", className)}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";

export const SheetDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("mt-1 text-sm text-muted", className)}
    {...props}
  />
));
SheetDescription.displayName = "SheetDescription";

export function SheetBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex-1 overflow-y-auto px-5 py-4", className)} {...props} />
  );
}

export function SheetFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "shrink-0 border-t border-inherit px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
        className,
      )}
      {...props}
    />
  );
}
