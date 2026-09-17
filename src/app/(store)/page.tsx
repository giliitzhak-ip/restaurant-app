import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { getRepository } from "@/server/repositories";
import { Hero } from "@/features/home/hero";
import {
  BeforeAfterSection,
  CategoryGrid,
  CollectionStrip,
  ConsultCta,
  CustomerProjects,
  DesignerTeaser,
  FaqSection,
  InspirationGrid,
  ProductSection,
  ReviewsSection,
  ValueBar,
} from "@/features/home/sections";

export const metadata: Metadata = {
  title: `${brand.name} — ${brand.tagline}`,
  description: t.home.heroSubtitle,
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const repository = getRepository();

  const [categories, collections, bestSellers, newArrivals, featured, reviews, all] =
    await Promise.all([
      repository.listCategories(),
      repository.listCollections(),
      repository.listProducts({ bestSeller: true, sort: "popular", limit: 8 }),
      repository.listProducts({ isNew: true, sort: "new", limit: 8 }),
      repository.listProducts({ featured: true, sort: "popular", limit: 8 }),
      repository.listReviews(),
      repository.listProducts({ limit: 1 }),
    ]);

  const featuredCollections = collections.filter((collection) => collection.featured);

  return (
    <>
      <Hero productCount={all.total} />
      <ValueBar />
      <CategoryGrid categories={categories} />
      <DesignerTeaser />
      <CollectionStrip
        collections={featuredCollections.length ? featuredCollections : collections}
      />
      <ProductSection
        eyebrow={t.common.bestSeller}
        title={t.home.bestSellersTitle}
        subtitle={t.home.bestSellersSubtitle}
        href={`${routes.catalog}?sort=popular`}
        products={bestSellers.items}
      />
      <BeforeAfterSection />
      <ProductSection
        eyebrow={t.common.new}
        title={t.home.newArrivalsTitle}
        subtitle={t.home.newArrivalsSubtitle}
        href={`${routes.catalog}?sort=new`}
        products={newArrivals.items.length ? newArrivals.items : featured.items}
        className="border-y border-line bg-surface"
      />
      <InspirationGrid />
      <CustomerProjects />
      <ReviewsSection reviews={reviews} />
      <FaqSection />
      <ConsultCta />
    </>
  );
}
