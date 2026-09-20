"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/icon-button";

/**
 * Modal dialog.
 *
 * Radix supplies the parts that are hard to get right and invisible when they
 * are: the focus trap, Escape, the scroll lock, and returning focus to
 * whatever opened the dialog. What is set here is how it arrives and where it
 * sits.
 *
 * On a pointer device it is centred and fades up with a 0.985 scale — enough
 * to read as coming forward, not enough to look like a pop. On a phone it is
 * a bottom sheet: it rises from the edge the thumb is already near, keeps its
 * top corners rounded so the page behind stays legible, and never asks anyone
 * to reach the middle of the screen to dismiss it.
 *
 * Centring is done with flexbox rather than a translate, because the close
 * animation owns `transform` and the two would otherwise fight — and because
 * a translate-based centre needs an RTL exception that flexbox does not.
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // Subtle: the page stays readable behind it, so the dialog reads as
      // something on top of the page rather than a different screen.
      "fixed inset-0 z-50 bg-ink/35 backdrop-blur-[2px]",
      "data-[state=open]:animate-[fade-in_var(--dur-enter)_var(--ease-out-soft)_both]",
      "data-[state=closed]:animate-[fade-in_var(--dur-gentle)_var(--ease-out-soft)_reverse_forwards]",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = "DialogOverlay";

export const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    size?: "sm" | "md" | "lg" | "xl";
    hideClose?: boolean;
  }
>(({ className, children, size = "md", hideClose, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    {/* Positioning shell: it must not swallow clicks meant for the overlay. */}
    <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "pointer-events-auto relative flex max-h-[90dvh] w-full flex-col overflow-y-auto",
          "border border-line bg-surface p-6 shadow-raised",
          // Phone: a sheet on the bottom edge.
          "rounded-t-xl pb-[max(1.5rem,env(safe-area-inset-bottom))]",
          "animate-[enter-sheet_var(--dur-enter)_var(--ease-out-soft)_both]",
          "data-[state=closed]:animate-[exit-sheet_var(--dur-gentle)_var(--ease-out-soft)_forwards]",
          // Pointer device: a centred panel.
          "sm:rounded-lg sm:pb-6",
          "sm:animate-[enter-scale_var(--dur-enter)_var(--ease-out-soft)_both]",
          "sm:data-[state=closed]:animate-[exit-fade_var(--dur-gentle)_var(--ease-out-soft)_forwards]",
          size === "sm" && "sm:max-w-[26rem]",
          size === "md" && "sm:max-w-[34rem]",
          size === "lg" && "sm:max-w-[48rem]",
          size === "xl" && "sm:max-w-[64rem]",
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose ? (
          <DialogPrimitive.Close asChild>
            <IconButton
              label="סגירה"
              size="iconSm"
              className="absolute end-4 top-4 text-muted"
            >
              <X />
            </IconButton>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </div>
  </DialogPortal>
));
DialogContent.displayName = "DialogContent";

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 pe-8", className)} {...props} />;
}

export const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-xl", className)}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("mt-1.5 text-sm leading-relaxed text-muted", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-start",
        className,
      )}
      {...props}
    />
  );
}
