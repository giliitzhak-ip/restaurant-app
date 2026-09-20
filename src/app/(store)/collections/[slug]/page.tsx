import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/json-ld";
import { getRepository } from "@/server/repositories";
import { CatalogView } from "@/features/catalog/catalog-view";
import { parseSearchParams, type RawParams } from "@/features/catalog/search-params";

export async function generateStaticParams() {
  const collections = await getRepository().listCollections();
  return collections.map((collection) => ({ slug: collection.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getRepository().getCollection(slug);
  if (!collection) return {};
  return {
    title: `קולקציית ${collection.name}`,
    description: collection.description,
    alternates: { canonical: routes.collection(collection.slug) },
    openGraph: {
      title: `קולקציית ${collection.name}`,
      description: collection.description,
      images: [{ url: collection.heroImage }],
    },
  };
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawParams>;
}) {
  const { slug } = await params;
  const repository = getRepository();
  const collection = await repository.getCollection(slug);
  if (!collection) notFound();

  const state = parseSearchParams(await searchParams);
  const scoped = { ...state, collections: [collection.slug] };
  const [results, facets] = await Promise.all([
    repository.listProducts(scoped),
    repository.getFacets(),
  ]);

  const crumbs = [
    { label: t.nav.collections, href: "/collections" },
    { label: collection.name, href: routes.collection(collection.slug) },
  ];

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <JsonLd data={itemListJsonLd(results.items, collection.name)} />
      <CatalogView
        title={collection.name}
        subtitle={collection.description}
        crumbs={crumbs}
        facets={facets}
        state={scoped}
        results={results}
        lockedCollection={collection.slug}
        basePath={routes.collection(collection.slug)}
        intro={
          <p className="mt-6 max-w-2xl card p-5 text-sm leading-relaxed text-muted">
            {collection.story}
          </p>
        }
      />
    </>
  );
}
