"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { t } from "@/i18n";
import type { ProductSwatch } from "@/types/catalog";
import type { RoomDesignRecord, SurfaceKind } from "@/types/design";

/**
 * Lazy entry point for the room designer.
 *
 * The designer is the heaviest thing in the app: the homography solver, the
 * per-pixel renderer, the canvas stage and the vision client. None of it is
 * useful until someone actually opens a photo, and none of it should be in the
 * first payload of a shopping session.
 *
 * Server rendering stays on. Turning it off would save a little work, but it
 * also means an empty page until the chunk lands — bad for the customer and
 * bad for anything that reads the page without executing scripts. The win here
 * is the separate chunk, not skipping the render.
 */
const DesignerShell = dynamic(
  () => import("./designer-shell").then((mod) => mod.DesignerShell),
  {
    loading: () => (
      <div
        className="flex min-h-[70vh] flex-col items-center justify-center gap-3 text-muted"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="size-6 animate-spin" aria-hidden />
        <p className="text-sm">{t.designer.analyzing}</p>
      </div>
    ),
  },
);

export function DesignerEntry(props: {
  swatches: ProductSwatch[];
  initialProductSlug?: string;
  initialSurface?: SurfaceKind;
  savedDesign: RoomDesignRecord | null;
}) {
  return <DesignerShell {...props} />;
}
