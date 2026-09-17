"use client";

import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { cn } from "@/lib/utils";

export const RadioGroup = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Root ref={ref} className={cn("grid gap-2", className)} {...props} />
));
RadioGroup.displayName = "RadioGroup";

export const RadioGroupItem = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      "size-[18px] shrink-0 rounded-full border border-line-strong bg-surface transition-colors hover:border-ink data-[state=checked]:border-ink",
      className,
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
      <span className="size-2.5 rounded-full bg-ink" />
    </RadioGroupPrimitive.Indicator>
  </RadioGroupPrimitive.Item>
));
RadioGroupItem.displayName = "RadioGroupItem";

/** Card-style radio used for delivery method / waste allowance. */
export const RadioCard = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> & {
    title: string;
    description?: string;
    meta?: string;
  }
>(({ className, title, description, meta, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      "group flex w-full items-start gap-3 rounded-sm border border-line-strong bg-surface p-4 text-start transition-colors hover:border-ink data-[state=checked]:border-ink data-[state=checked]:bg-brass-wash/40",
      className,
    )}
    {...props}
  >
    <span className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface group-data-[state=checked]:border-ink">
      <RadioGroupPrimitive.Indicator asChild>
        <span className="size-2.5 rounded-full bg-ink" />
      </RadioGroupPrimitive.Indicator>
    </span>
    <span className="flex-1">
      <span className="block text-sm font-medium text-ink">{title}</span>
      {description ? (
        <span className="mt-0.5 block text-xs leading-relaxed text-muted">
          {description}
        </span>
      ) : null}
    </span>
    {meta ? <span className="num text-sm text-ink-soft">{meta}</span> : null}
  </RadioGroupPrimitive.Item>
));
RadioCard.displayName = "RadioCard";
