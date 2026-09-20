"use client";

import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * A button whose whole content is an icon.
 *
 * It exists for one reason: `label` is required. The storefront had a dozen
 * hand-rolled icon buttons — close, favourite, delete, rename, next photo —
 * and the ones that were missing an `aria-label` were unreachable by name for
 * anyone using a screen reader. Making the label part of the type means that
 * cannot be forgotten again; it also becomes the tooltip, so a sighted user
 * who hovers gets the same word.
 *
 * Sizing goes through `Button`, whose icon sizes carry `tap-target`, so even
 * the 32px variant answers a 44px touch.
 */
export const IconButton = React.forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, "size" | "block" | "aria-label"> & {
    /** Announced, and shown as the native tooltip. */
    label: string;
    size?: "icon" | "iconSm";
  }
>(({ label, size = "icon", variant = "ghost", title, ...props }, ref) => (
  <Button
    ref={ref}
    variant={variant}
    size={size}
    aria-label={label}
    title={title ?? label}
    {...props}
  />
));
IconButton.displayName = "IconButton";
