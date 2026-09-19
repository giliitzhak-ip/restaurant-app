"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "scrollbar-none flex gap-6 overflow-x-auto border-b border-line",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = "TabsList";

export const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "-mb-px shrink-0 border-b-2 border-transparent pb-3 text-sm text-muted transition-colors hover:text-ink data-[state=active]:border-ink data-[state=active]:text-ink",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

/**
 * Panels stay mounted.
 *
 * Radix unmounts an inactive panel by default, which leaves every trigger
 * pointing `aria-controls` at an element that is not in the document — a
 * WCAG 4.1.2 failure, and a real one: assistive technology is told the
 * relationship exists and then cannot follow it. `forceMount` keeps the panel
 * in the tree; Radix still sets `hidden` on the inactive ones, so nothing is
 * read out or focusable until its tab is chosen.
 *
 * It also means the specification table is in the HTML for search engines and
 * for anyone reading the page without JavaScript.
 */
export const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    forceMount
    className={cn("pt-6 focus-visible:outline-none data-[state=inactive]:hidden", className)}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";
