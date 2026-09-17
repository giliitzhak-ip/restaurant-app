import { media } from "@/lib/media";
import { roundTo } from "@/lib/format";
import type {
  Availability,
  Category,
  Collection,
  Coupon,
  Product,
  ProductImage,
  ProductSwatch,
  ProductTexture,
  Review,
} from "@/types/catalog";
import {
  seedCategories,
  seedCollections,
  seedCoupons,
  seedProducts,
  seedReviews,
  type SeedProduct,
} from "./catalog-seed";
import { resolveFootprint } from "./texture-geometry";

/**
 * Turns the authored seed into the domain shape the app consumes.
 *
 * Both the database seed script and the in-memory repository run through this
 * function, so a product looks identical whether it came from PostgreSQL or
 * from the fallback store.
 */

/** Below this many units a product is flagged as low stock. */
export const LOW_STOCK_AT = 20;

export const categoryId = (slug: string) => `cat_${slug}`;
export const collectionId = (slug: string) => `col_${slug}`;
export const productId = (slug: string) => `prd_${slug}`;

export function buildCategories(): Category[] {
  return seedCategories.map((category) => ({
    id: categoryId(category.slug),
    slug: category.slug,
    name: category.name,
    shortDescription: category.shortDescription,
    longDescription: category.longDescription,
    heroImage: media.category(category.slug),
    tileImage: media.category(category.slug),
    surface: category.surface,
    position: category.position,
    seoTitle: category.seoTitle,
    seoDescription: category.seoDescription,
  }));
}

export function buildCollections(): Collection[] {
  return seedCollections.map((collection) => ({
    id: collectionId(collection.slug),
    slug: collection.slug,
    name: collection.name,
    description: collection.description,
    story: collection.story,
    heroImage: media.collection(collection.slug),
    featured: collection.featured,
    position: collection.position,
  }));
}

export function availabilityFor(seed: {
  stockUnits: number;
  leadTimeDays: number;
  quoteOnly?: boolean;
}): Availability {
  if (seed.quoteOnly) return "MADE_TO_ORDER";
  if (seed.stockUnits <= 0) {
    return seed.leadTimeDays > 10 ? "MADE_TO_ORDER" : "OUT_OF_STOCK";
  }
  return seed.stockUnits < LOW_STOCK_AT ? "LOW_STOCK" : "IN_STOCK";
}

export function pricePerSqmFor(seed: {
  pricePerUnit: number;
  packageCoverageSqm: number | null;
}): number | null {
  if (!seed.packageCoverageSqm || seed.packageCoverageSqm <= 0) return null;
  return roundTo(seed.pricePerUnit / seed.packageCoverageSqm, 0);
}

function buildImages(seed: SeedProduct): ProductImage[] {
  const shots = seed.shots ?? ["STUDIO", "ROOM", "DETAIL"];
  const order: Array<{ kind: ProductImage["kind"]; shot: "studio" | "room" | "detail" }> = [
    { kind: "STUDIO", shot: "studio" },
    { kind: "ROOM", shot: "room" },
    { kind: "DETAIL", shot: "detail" },
  ];
  return order
    .filter((entry) => shots.includes(entry.kind))
    .map((entry, index) => ({
      id: `img_${seed.slug}_${entry.shot}`,
      url: media.product(seed.slug, entry.shot),
      alt:
        entry.kind === "ROOM"
          ? `${seed.name} — הדמיה בחלל`
          : entry.kind === "DETAIL"
            ? `${seed.name} — תקריב מרקם`
            : `${seed.name} — ${seed.subtitle}`,
      kind: entry.kind,
      position: index,
    }));
}

export function buildTexture(seed: SeedProduct): ProductTexture | null {
  if (!seed.texture) return null;
  const footprint = resolveFootprint(
    seed.texture.widthCm,
    seed.texture.heightCm,
    seed.texture.recipe,
  );
  return {
    id: `tex_${seed.slug}`,
    productId: productId(seed.slug),
    imageUrl: media.texture(seed.slug),
    thumbnailUrl: media.textureThumb(seed.slug),
    widthCm: footprint.widthCm,
    heightCm: footprint.heightCm,
    patternType: seed.texture.patternType,
    repeatX: footprint.repeatX,
    repeatY: footprint.repeatY,
    orientation: seed.texture.orientation,
    scaleFactor: seed.texture.scaleFactor,
  };
}

export function buildProducts(): Product[] {
  const categories = new Map(seedCategories.map((c) => [c.slug, c]));
  const collections = new Map(seedCollections.map((c) => [c.slug, c]));

  return seedProducts.map((seed) => {
    const category = categories.get(seed.category);
    if (!category) throw new Error(`Unknown category "${seed.category}" on ${seed.slug}`);
    const collection = seed.collection ? collections.get(seed.collection) : undefined;

    return {
      id: productId(seed.slug),
      slug: seed.slug,
      sku: seed.sku,
      name: seed.name,
      subtitle: seed.subtitle,
      brand: seed.brand,
      categoryId: categoryId(category.slug),
      categorySlug: category.slug,
      categoryName: category.name,
      collectionId: collection ? collectionId(collection.slug) : null,
      collectionSlug: collection?.slug ?? null,
      collectionName: collection?.name ?? null,
      description: seed.description,
      installationNotes: seed.installationNotes ?? "",
      maintenanceNotes: seed.maintenanceNotes ?? "",
      pricePerUnit: seed.pricePerUnit,
      compareAtPrice: seed.compareAtPrice ?? null,
      pricingUnit: seed.pricingUnit,
      packageCoverageSqm: seed.packageCoverageSqm,
      pricePerSqm: pricePerSqmFor(seed),
      stockUnits: seed.stockUnits,
      availability: availabilityFor(seed),
      leadTimeDays: seed.leadTimeDays,
      sampleAvailable: seed.sampleAvailable ?? false,
      quoteOnly: seed.quoteOnly ?? false,
      specs: seed.specs,
      images: buildImages(seed),
      texture: buildTexture(seed),
      featured: seed.featured ?? false,
      isNew: seed.isNew ?? false,
      bestSeller: seed.bestSeller ?? false,
      active: true,
      popularity: seed.popularity,
      ratingAverage: seed.ratingAverage,
      ratingCount: seed.ratingCount,
      createdAt: seed.createdAt,
    } satisfies Product;
  });
}

export function buildReviews(): Review[] {
  return seedReviews.map((review, index) => ({
    id: `rev_${index + 1}`,
    productId: review.product ? productId(review.product) : null,
    authorName: review.authorName,
    city: review.city,
    rating: review.rating,
    title: review.title,
    body: review.body,
    createdAt: review.createdAt,
    approved: review.approved,
  }));
}

export function buildCoupons(): Coupon[] {
  return seedCoupons.map((coupon, index) => ({
    id: `cpn_${index + 1}`,
    code: coupon.code,
    kind: coupon.kind,
    value: coupon.value,
    minSubtotal: coupon.minSubtotal,
    active: coupon.active,
    expiresAt: coupon.expiresAt,
    usageCount: 0,
  }));
}

/** Reduces a product to what the designer swatch drawer needs. */
export function toSwatch(product: Product): ProductSwatch | null {
  if (!product.texture) return null;
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    subtitle: product.subtitle,
    colorHex: product.specs.colorHex,
    tone: product.specs.tone,
    material: product.specs.material,
    surface: product.specs.surface,
    pricePerSqm: product.pricePerSqm,
    pricePerUnit: product.pricePerUnit,
    packageCoverageSqm: product.packageCoverageSqm,
    thumbnailUrl: product.texture.thumbnailUrl,
    textureUrl: product.texture.imageUrl,
    patternType: product.texture.patternType,
    textureWidthCm: product.texture.widthCm,
    textureHeightCm: product.texture.heightCm,
    orientation: product.texture.orientation,
    scaleFactor: product.texture.scaleFactor,
  };
}
