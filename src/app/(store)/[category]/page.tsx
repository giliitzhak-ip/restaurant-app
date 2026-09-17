import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { routes } from "@/config/site";
import { blurDataUrl } from "@/lib/media";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/json-ld";
import { getRepository } from "@/server/repositories";
import { CatalogView } from "@/features/catalog/catalog-view";
import { parseSearchParams, type RawParams } from "@/features/catalog/search-params";

/**
 * Category landing pages live at the root (`/parquet`, `/wall-cladding`) for
 * short, SEO-friendly URLs. Static routes such as `/cart` take precedence in
 * the app router, so there is no collision.
 */
export async function generateStaticParams() {
  const categories = await getRepository().listCategories();
  return categories.map((category) => ({ category: category.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category: slug } = await params;
  const category = await getRepository().getCategory(slug);
  if (!category) return {};
  return {
    title: category.seoTitle,
    description: category.seoDescription,
    alternates: { canonical: routes.category(category.slug) },
    openGraph: {
      title: category.seoTitle,
      description: category.seoDescription,
      images: [{ url: category.heroImage }],
    },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<RawParams>;
}) {
  const { category: slug } = await params;
  const repository = getRepository();
  const category = await repository.getCategory(slug);
  if (!category) notFound();

  const state = parseSearchParams(await searchParams);
  const scoped = { ...state, categories: [category.slug] };
  const [results, facets] = await Promise.all([
    repository.listProducts(scoped),
    repository.getFacets(),
  ]);

  const crumbs = [{ label: category.name, href: routes.category(category.slug) }];

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <JsonLd data={itemListJsonLd(results.items, category.name)} />
      <CatalogView
        title={category.name}
        subtitle={category.shortDescription}
        crumbs={crumbs}
        facets={facets}
        state={scoped}
        results={results}
        lockedCategory={category.slug}
        basePath={routes.category(category.slug)}
        intro={
          <div className="mt-8 grid gap-6 rounded-lg border border-line bg-surface p-5 md:grid-cols-[18rem_1fr] md:items-center md:p-6">
            <div className="relative aspect-4/3 overflow-hidden rounded-sm bg-surface-2">
              <Image
                src={category.heroImage}
                alt={category.name}
                fill
                sizes="(max-width: 768px) 100vw, 288px"
                placeholder="blur"
                blurDataURL={blurDataUrl}
                className="object-cover"
              />
            </div>
            <p className="text-sm leading-relaxed text-muted">
              {category.longDescription}
            </p>
          </div>
        }
      />
    </>
  );
}
