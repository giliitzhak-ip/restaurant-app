import type { Metadata } from "next";
import { toSwatch } from "@/data/build-catalog";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { getRepository } from "@/server/repositories";
import { requireDesignOwnership, stripDesignSecrets } from "@/server/security/ownership";
import { DesignerEntry } from "@/features/room-designer/components/designer-entry";
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
  const { product, surface, design: designId } = await searchParams;
  const repository = getRepository();
  const { items } = await repository.listProducts({
    hasTexture: true,
    limit: 200,
    sort: "popular",
  });
  const swatches = items.map(toSwatch).filter(isTruthy);

  /*
   * The object library, read here rather than fetched from the client, so the
   * "add items" drawer is populated the moment it opens. It is small — forty
   * rows of metadata — and it is the same for every visitor.
   */
  const objectAssets = await repository.listDesignObjectAssets();

  /*
   * Reopening a saved design. The id in the query string is a claim, not a
   * credential — the same helper the write actions use decides whether this
   * visitor owns the row, including the guest-cookie case that a plain
   * `userId` check silently let through.
   */
  let savedDesign = null;
  if (designId) {
    const owned = await requireDesignOwnership(designId);
    if (owned.ok) savedDesign = stripDesignSecrets(owned.design);
  }

  const initialSurface: SurfaceKind | undefined =
    surface === "wall" ? "WALL" : surface === "floor" ? "FLOOR" : undefined;

  return (
    <DesignerEntry
      swatches={swatches}
      objectAssets={objectAssets}
      initialProductSlug={product}
      initialSurface={initialSurface}
      savedDesign={savedDesign}
    />
  );
}
