import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { formatArea } from "@/lib/format";
import { breadcrumbJsonLd, productJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/json-ld";
import { Badge } from "@/components/ui/badge";
import { Rating } from "@/components/ui/rating";
import { SectionHeading } from "@/components/ui/section-heading";
import { Breadcrumbs } from "@/components/breadcrumbs";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { getRepository } from "@/server/repositories";
import { AddToCartPanel } from "@/features/catalog/add-to-cart-panel";
import { AvailabilityBadge } from "@/features/catalog/availability-badge";
import { PriceTag } from "@/features/catalog/price-tag";
import { ProductGallery } from "@/features/catalog/product-gallery";
import { ProductRail } from "@/features/catalog/product-rail";
import { QuantityCalculator } from "@/features/catalog/quantity-calculator";
import { SpecTable } from "@/features/catalog/spec-table";
import { ProductViewTracker } from "@/features/catalog/product-view-tracker";

export async function generateStaticParams() {
  const { items } = await getRepository().listProducts({ limit: 100 });
  return items.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getRepository().getProductBySlug(slug);
  if (!product) return {};

  const title = `${product.name} — ${product.subtitle}`;
  return {
    title,
    description: product.description.slice(0, 160),
    alternates: { canonical: routes.product(product.slug) },
    openGraph: {
      type: "website",
      title,
      description: product.description.slice(0, 200),
      images: product.images.map((image) => ({ url: image.url, alt: image.alt })),
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const repository = getRepository();
  const product = await repository.getProductBySlug(slug);
  if (!product) notFound();

  const [reviews, sameCollection, related] = await Promise.all([
    repository.listReviews(product.id),
    product.collectionSlug
      ? repository.listProducts({
          collections: [product.collectionSlug],
          limit: 8,
          sort: "popular",
        })
      : Promise.resolve({ items: [], total: 0 }),
    repository.listProducts({
      categories: [product.categorySlug],
      limit: 9,
      sort: "popular",
    }),
  ]);

  const crumbs = [
    { label: product.categoryName, href: routes.category(product.categorySlug) },
    { label: product.name, href: routes.product(product.slug) },
  ];

  const relatedItems = related.items.filter((item) => item.id !== product.id).slice(0, 8);
  const collectionItems = sameCollection.items
    .filter((item) => item.id !== product.id)
    .slice(0, 8);

  return (
    <>
      <JsonLd data={productJsonLd(product, reviews.length)} />
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <ProductViewTracker product={product} />

      <div className="container-page py-6 md:py-10">
        <Breadcrumbs items={crumbs} />

        <div className="mt-6 grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
          <ProductGallery images={product.images} name={product.name} />

          <div>
            <div className="flex flex-wrap items-center gap-2">
              {product.collectionName ? (
                <Link
                  href={routes.collection(product.collectionSlug!)}
                  className="eyebrow link-quiet"
                >
                  {t.product.collection} {product.collectionName}
                </Link>
              ) : (
                <span className="eyebrow">{product.categoryName}</span>
              )}
              {product.isNew ? <Badge variant="ink">{t.common.new}</Badge> : null}
              {product.bestSeller ? (
                <Badge variant="brass">{t.common.bestSeller}</Badge>
              ) : null}
            </div>

            <h1 className="mt-3 text-display-sm">{product.name}</h1>
            <p className="mt-2 text-[0.9375rem] text-muted">{product.subtitle}</p>

            {product.ratingCount > 0 ? (
              <Rating
                value={product.ratingAverage}
                count={product.ratingCount}
                className="mt-3"
              />
            ) : null}

            <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-y border-line py-5">
              <PriceTag product={product} size="lg" />
              <div className="flex flex-col items-start gap-1.5">
                <AvailabilityBadge
                  availability={product.availability}
                  leadTimeDays={product.leadTimeDays}
                />
                {product.packageCoverageSqm ? (
                  <span className="num text-xs text-muted">
                    {t.product.packageCoverage}: {formatArea(product.packageCoverageSqm)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-6">
              <AddToCartPanel product={product} />
            </div>

            <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted">{t.product.material}</dt>
                <dd className="mt-0.5 text-ink">{product.specs.materialLabel}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t.product.dimensions}</dt>
                <dd className="num mt-0.5 text-ink">
                  {product.specs.widthMm / 10} × {product.specs.lengthMm / 10} ס״מ
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t.product.durability}</dt>
                <dd className="mt-0.5 text-ink">{product.specs.durability}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t.product.warranty}</dt>
                <dd className="num mt-0.5 text-ink">
                  {product.specs.warrantyYears} שנים
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* calculator + details */}
        <div className="mt-16 grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
          <div>
            <Tabs defaultValue="description">
              <TabsList>
                <TabsTrigger value="description">{t.product.description}</TabsTrigger>
                <TabsTrigger value="specs">{t.product.specs}</TabsTrigger>
                <TabsTrigger value="installation">
                  {t.product.installation}
                </TabsTrigger>
                <TabsTrigger value="maintenance">{t.product.maintenance}</TabsTrigger>
              </TabsList>
              <TabsContent value="description">
                <p className="max-w-2xl text-[0.9375rem] leading-relaxed text-ink-soft">
                  {product.description}
                </p>
              </TabsContent>
              <TabsContent value="specs">
                <SpecTable product={product} />
              </TabsContent>
              <TabsContent value="installation">
                <p className="max-w-2xl text-[0.9375rem] leading-relaxed text-ink-soft">
                  {product.installationNotes}
                </p>
              </TabsContent>
              <TabsContent value="maintenance">
                <p className="max-w-2xl text-[0.9375rem] leading-relaxed text-ink-soft">
                  {product.maintenanceNotes}
                </p>
              </TabsContent>
            </Tabs>

            {reviews.length > 0 ? (
              <section className="mt-14">
                <h2 className="text-xl">{t.product.reviewsTitle}</h2>
                <ul className="mt-5 space-y-5">
                  {reviews.map((review) => (
                    <li key={review.id} className="border-b border-line pb-5">
                      <Rating value={review.rating} />
                      <h3 className="mt-2.5 text-[0.9375rem] font-medium text-ink">
                        {review.title}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted">
                        {review.body}
                      </p>
                      <p className="mt-2 text-xs text-muted-soft">
                        {review.authorName} · {review.city}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <p className="mt-10 text-sm text-muted">{t.product.noReviews}</p>
            )}
          </div>

          <div className="lg:sticky lg:top-24 lg:h-fit">
            {product.packageCoverageSqm ? (
              <QuantityCalculator product={product} />
            ) : null}
          </div>
        </div>

        {collectionItems.length > 0 ? (
          <section className="mt-20">
            <SectionHeading
              title={t.product.sameCollectionTitle}
              link={{
                label: t.common.viewAll,
                href: routes.collection(product.collectionSlug!),
              }}
            />
            <div className="mt-8">
              <ProductRail products={collectionItems} />
            </div>
          </section>
        ) : null}

        {relatedItems.length > 0 ? (
          <section className="mt-20">
            <SectionHeading
              title={t.product.relatedTitle}
              link={{
                label: t.common.viewAll,
                href: routes.category(product.categorySlug),
              }}
            />
            <div className="mt-8">
              <ProductRail products={relatedItems} />
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
