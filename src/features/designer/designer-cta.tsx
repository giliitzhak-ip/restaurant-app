"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { routes } from "@/config/site";
import { track } from "@/lib/analytics";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { AnalyticsEvents } from "@/lib/analytics/events";

/**
 * The room designer is the site's main call to action, so it is a single
 * component: one place to change the label, and one place that reports where
 * the visitor entered from.
 */
export function DesignerCta({
  label,
  entry,
  productSlug,
  surface,
  withIcon = true,
  ...buttonProps
}: {
  label: string;
  entry: AnalyticsEvents["start_room_designer"]["entry"];
  productSlug?: string;
  surface?: "floor" | "wall";
  withIcon?: boolean;
} & Omit<ButtonProps, "asChild" | "children">) {
  const href = productSlug
    ? routes.designerWithProduct(productSlug, surface)
    : routes.designer;

  return (
    <Button asChild {...buttonProps}>
      <Link href={href} onClick={() => track("start_room_designer", { entry })}>
        {withIcon ? <Sparkles /> : null}
        {label}
      </Link>
    </Button>
  );
}
