"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

export const Slider = React.forwardRef<
  React.ComponentRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
    theme?: "light" | "studio";
    thumbLabel?: string;
  }
>(({ className, theme = "light", thumbLabel, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center py-2",
      className,
    )}
    {...props}
  >
    <SliderPrimitive.Track
      className={cn(
        "relative h-1 w-full grow overflow-hidden rounded-full",
        theme === "light" ? "bg-line-strong" : "bg-studio-line",
      )}
    >
      <SliderPrimitive.Range
        className={cn(
          "absolute h-full",
          theme === "light" ? "bg-ink" : "bg-studio-ink",
        )}
      />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className={cn(
        "interactive block size-4 rounded-full border shadow-subtle",
        theme === "light"
          ? "border-ink bg-surface"
          : "border-studio-ink bg-studio-ink",
      )}
      aria-label={thumbLabel}
    />
  </SliderPrimitive.Root>
));
Slider.displayName = "Slider";
