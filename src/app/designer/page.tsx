import type { Metadata } from "next";
import { toSwatch } from "@/data/build-catalog";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { getRepository } from "@/server/repositories";
import { DesignerShell } from "@/features/room-designer/components/designer-shell";
import { isTruthy } from "@/lib/utils";
import type { SurfaceKind } from "@/types/design";

export const metadata: Metadata = {
  title: t.designer.title,
  description: t.designer.introBody,
  alternates: { canonical: routes.designer },
};

export default async function DesignerPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; surface?: string; design?: string }>;
}) {
  const { product, surface } = await searchParams;
  const { items } = await getRepository().listProducts({
    hasTexture: true,
    limit: 200,
    sort: "popular",
  });
  const swatches = items.map(toSwatch).filter(isTruthy);

  const initialSurface: SurfaceKind | undefined =
    surface === "wall" ? "WALL" : surface === "floor" ? "FLOOR" : undefined;

  return (
    <DesignerShell
      swatches={swatches}
      initialProductSlug={product}
      initialSurface={initialSurface}
    />
  );
}
