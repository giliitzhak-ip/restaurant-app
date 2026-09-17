import type { Metadata } from "next";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { itemListJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/json-ld";
import { getRepository } from "@/server/repositories";
import { CatalogView } from "@/features/catalog/catalog-view";
import { parseSearchParams, type RawParams } from "@/features/catalog/search-params";

export const metadata: Metadata = {
  title: t.catalog.title,
  description: t.catalog.subtitle,
  alternates: { canonical: routes.catalog },
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const params = await searchParams;
  const state = parseSearchParams(params);
  const repository = getRepository();
  const [results, facets] = await Promise.all([
    repository.listProducts(state),
    repository.getFacets(),
  ]);

  return (
    <>
      <JsonLd data={itemListJsonLd(results.items, t.catalog.title)} />
      <CatalogView
        title={state.search ? `חיפוש: ${state.search}` : t.catalog.title}
        subtitle={t.catalog.subtitle}
        crumbs={[{ label: t.nav.catalog, href: routes.catalog }]}
        facets={facets}
        state={state}
        results={results}
        basePath={routes.catalog}
      />
    </>
  );
}
