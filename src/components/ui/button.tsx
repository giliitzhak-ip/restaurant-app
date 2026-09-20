"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

/**
 * The button.
 *
 * Everything clickable in the storefront that is not a piece of running text
 * comes from here, so that a press feels the same on the product page, in the
 * dark room designer and in the admin tables.
 *
 * Eight states, all of them reachable from props rather than from classes at
 * the call site:
 *
 *   normal · hover · active · focus-visible · disabled · loading · success · error
 *
 * Two of those are worth spelling out, because they are where buttons usually
 * go wrong:
 *
 * **loading** keeps the label in the layout and hides it, then centres the
 * spinner over it. The button is therefore exactly as wide while it works as
 * it was before — no reflow of the row it sits in, no target moving out from
 * under a thumb. It is also genuinely disabled while busy, so a double tap
 * cannot submit twice.
 *
 * **success** swaps the face for a ✓ for a moment, in the same width, and then
 * goes back. It is a confirmation, not a new state to get stuck in — the
 * caller decides how long by holding the prop.
 *
 * Motion comes from the `press` utility in globals.css: a 1px lift on hover,
 * 0.98 on press, 140ms on the shared easing curve, hover only where a pointer
 * can actually hover, and no movement at all under prefers-reduced-motion.
 */

const buttonVariants = cva(
  [
    "relative isolate inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "font-medium tracking-[0.01em] press",
    // Disabled: visibly blocked, and the cursor says so. The `:not([data-busy])`
    // keeps a *busy* button — which is also `disabled` — at full strength,
    // because working is not the same as unavailable.
    "[&:disabled:not([data-busy])]:cursor-not-allowed",
    "[&:disabled:not([data-busy])]:opacity-45",
    "[&:disabled:not([data-busy])]:saturate-50",
    "[&[aria-disabled=true]]:cursor-not-allowed [&[aria-disabled=true]]:opacity-45",
    "[&[aria-disabled=true]]:pointer-events-none",
    "data-[busy]:cursor-wait",
    "[&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        /* The one action a screen is really asking for. */
        primary:
          "rounded-sm bg-ink text-canvas [&:not(:disabled)]:hover:bg-ink-soft",
        /* Second in the same row: present, quieter, still filled. */
        secondary:
          "rounded-sm bg-surface-2 text-ink [&:not(:disabled)]:hover:bg-surface-3",
        /* Third: an outline, for actions people take less often. */
        outline:
          "rounded-sm border border-line-strong bg-transparent text-ink [&:not(:disabled)]:hover:border-ink [&:not(:disabled)]:hover:bg-surface",
        /* Fourth: no chrome until you touch it. Toolbars and card corners. */
        ghost: "rounded-sm text-ink [&:not(:disabled)]:hover:bg-surface-2",
        /* Destructive. Never the default of a pair. */
        danger:
          "rounded-sm bg-danger text-white [&:not(:disabled)]:hover:bg-[#8d3126]",
        /* Confirming, not celebrating — the same weight as primary. */
        success:
          "rounded-sm bg-success text-white [&:not(:disabled)]:hover:bg-[#355a42]",
        /* A button that has to sit inside a sentence. */
        link: "h-auto rounded-xs p-0 text-ink underline-offset-4 [&:not(:disabled)]:hover:underline",

        /* --- brand extensions -------------------------------------------
         * Not in the seven above, and deliberately kept: `brass` is the
         * accent this shop is built on, and the two `studio` variants are the
         * only thing readable on the room designer's dark panels. Dropping
         * them would not merge a duplicate, it would delete a surface. */
        brass:
          "rounded-sm bg-brass text-white [&:not(:disabled)]:hover:bg-[#7a5c3a]",
        studio:
          "rounded-sm bg-studio-ink text-studio focus-ring-invert [&:not(:disabled)]:hover:bg-white",
        studioOutline:
          "rounded-sm border border-studio-line text-studio-ink focus-ring-invert [&:not(:disabled)]:hover:border-studio-ink/60 [&:not(:disabled)]:hover:bg-white/5",
      },
      size: {
        /* 36px. Below the 44px minimum on purpose — it is a dense-toolbar
           size — so it carries `tap-target`, which grows the hit area to 44
           without changing a pixel of the layout. */
        sm: "h-9 px-3.5 text-[0.8125rem] tap-target [&_svg]:size-4",
        /* 44px: the field height, so a button next to an input lines up. */
        md: "h-11 px-5 text-sm [&_svg]:size-4",
        lg: "h-13 px-7 text-[0.9375rem] [&_svg]:size-[18px]",
        icon: "size-11 [&_svg]:size-[18px]",
        iconSm: "size-8 tap-target [&_svg]:size-4",
      },
      block: { true: "w-full", false: "" },
    },
    compoundVariants: [
      // `link` has no box, so it gets no box height either.
      { variant: "link", size: "sm", class: "h-auto px-0" },
      { variant: "link", size: "md", class: "h-auto px-0" },
      { variant: "link", size: "lg", class: "h-auto px-0" },
    ],
    defaultVariants: { variant: "primary", size: "md", block: false },
  },
);

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  children?: React.ReactNode;
  /** Work is in flight: spinner over the label, width unchanged, clicks blocked. */
  loading?: boolean;
  /** Announced in place of the label while loading. */
  loadingLabel?: string;
  /** Show a ✓ in place of the face. The caller controls how long. */
  success?: boolean;
  /** The last attempt failed. Marks the control, without shaking it. */
  error?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      block,
      asChild = false,
      loading = false,
      loadingLabel = "שולח",
      success = false,
      error = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    /*
     * `asChild` renders a link. Radix's Slot takes exactly one child, and a
     * link has nothing to be busy about, so the overlay states are simply not
     * available there — passing them changes nothing rather than crashing.
     */
    if (asChild) {
      return (
        <Slot
          ref={ref}
          className={cn(buttonVariants({ variant, size, block }), className)}
          aria-disabled={disabled || undefined}
          {...props}
        >
          {children}
        </Slot>
      );
    }

    const overlay = loading ? "loading" : success ? "success" : null;

    return (
      <button
        ref={ref}
        className={cn(
          buttonVariants({ variant, size, block }),
          // The error state is a border and a description, never a shake:
          // movement that says "wrong" is unpleasant the second time and
          // useless to anyone who cannot see it.
          error && "ring-1 ring-danger/60",
          className,
        )}
        disabled={disabled || loading}
        data-busy={loading ? "" : undefined}
        aria-busy={loading || undefined}
        {...props}
      >
        {/*
         * The face stays in the flow while an overlay is up — `invisible`,
         * not `hidden` — which is what keeps the button the same width from
         * the first frame to the last.
         */}
        <span
          className={cn(
            "inline-flex items-center justify-center gap-2",
            overlay && "invisible",
          )}
        >
          {children}
        </span>

        {loading ? (
          <span className="absolute inset-0 grid place-items-center text-[1.15em]">
            <Spinner labelled={false} />
            <span className="sr-only">{loadingLabel}</span>
          </span>
        ) : null}

        {overlay === "success" ? (
          <span className="absolute inset-0 grid place-items-center enter-soft">
            <Check className="size-[1.15em]" aria-hidden />
          </span>
        ) : null}
      </button>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
