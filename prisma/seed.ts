/**
 * Seeds PostgreSQL from the same authored data the in-memory driver uses, so
 * the two drivers are always in sync.
 *
 *   DATABASE_URL=postgresql://… npm run db:push
 *   DATABASE_URL=postgresql://… npm run db:seed
 */
import { hashSync } from "bcryptjs";
import {
  buildCategories,
  buildCollections,
  buildCoupons,
  buildProducts,
  buildReviews,
  LOW_STOCK_AT,
} from "../src/data/build-catalog";
import {
  libraryAssets,
  libraryCategories,
  objectAssetUrl,
} from "../src/data/object-library";
import { getPrisma } from "../src/server/db/prisma";

async function main() {
  const prisma = getPrisma();

  const categories = buildCategories();
  const collections = buildCollections();
  const products = buildProducts();
  const reviews = buildReviews();
  const coupons = buildCoupons();

  console.log("▸ categories");
  for (const category of categories) {
    const { id: _id, ...data } = category;
    await prisma.category.upsert({
      where: { slug: category.slug },
      create: data,
      update: data,
    });
  }

  console.log("▸ collections");
  for (const collection of collections) {
    const { id: _id, ...data } = collection;
    await prisma.collection.upsert({
      where: { slug: collection.slug },
      create: data,
      update: data,
    });
  }

  const categoryIds = new Map(
    (await prisma.category.findMany({ select: { id: true, slug: true } })).map((row) => [
      row.slug,
      row.id,
    ]),
  );
  const collectionIds = new Map(
    (await prisma.collection.findMany({ select: { id: true, slug: true } })).map((row) => [
      row.slug,
      row.id,
    ]),
  );

  console.log(`▸ products (${products.length})`);
  for (const product of products) {
    const categoryId = categoryIds.get(product.categorySlug);
    if (!categoryId) throw new Error(`Missing category ${product.categorySlug}`);
    const collectionId = product.collectionSlug
      ? (collectionIds.get(product.collectionSlug) ?? null)
      : null;

    const data = {
      slug: product.slug,
      sku: product.sku,
      name: product.name,
      subtitle: product.subtitle,
      brand: product.brand,
      description: product.description,
      installationNotes: product.installationNotes,
      maintenanceNotes: product.maintenanceNotes,
      categoryId,
      collectionId,
      pricePerUnit: product.pricePerUnit,
      compareAtPrice: product.compareAtPrice,
      pricingUnit: product.pricingUnit,
      packageCoverageSqm: product.packageCoverageSqm,
      pricePerSqm: product.pricePerSqm,
      stockUnits: product.stockUnits,
      lowStockAt: LOW_STOCK_AT,
      leadTimeDays: product.leadTimeDays,
      sampleAvailable: product.sampleAvailable,
      quoteOnly: product.quoteOnly,
      material: product.specs.material,
      materialLabel: product.specs.materialLabel,
      widthMm: product.specs.widthMm,
      lengthMm: product.specs.lengthMm,
      thicknessMm: product.specs.thicknessMm,
      wearLayerMm: product.specs.wearLayerMm ?? null,
      colorName: product.specs.colorName,
      colorHex: product.specs.colorHex,
      tone: product.specs.tone,
      style: product.specs.style,
      textureLabel: product.specs.textureLabel,
      durability: product.specs.durability,
      warrantyYears: product.specs.warrantyYears,
      installationType: product.specs.installationType,
      waterResistance: product.specs.waterResistance,
      usage: product.specs.usage,
      surface: product.specs.surface,
      underfloorHeating: product.specs.underfloorHeating ?? false,
      acousticRating: product.specs.acousticRating ?? null,
      featured: product.featured,
      isNew: product.isNew,
      bestSeller: product.bestSeller,
      active: product.active,
      popularity: product.popularity,
      ratingAverage: product.ratingAverage,
      ratingCount: product.ratingCount,
      createdAt: new Date(product.createdAt),
    };

    const row = await prisma.product.upsert({
      where: { slug: product.slug },
      create: data,
      update: data,
    });

    await prisma.productImage.deleteMany({ where: { productId: row.id } });
    if (product.images.length) {
      await prisma.productImage.createMany({
        data: product.images.map((image) => ({
          productId: row.id,
          url: image.url,
          alt: image.alt,
          kind: image.kind,
          position: image.position,
        })),
      });
    }

    if (product.texture) {
      const texture = {
        imageUrl: product.texture.imageUrl,
        thumbnailUrl: product.texture.thumbnailUrl,
        widthCm: product.texture.widthCm,
        heightCm: product.texture.heightCm,
        patternType: product.texture.patternType,
        repeatX: product.texture.repeatX,
        repeatY: product.texture.repeatY,
        orientation: product.texture.orientation,
        scaleFactor: product.texture.scaleFactor,
      };
      await prisma.productTexture.upsert({
        where: { productId: row.id },
        create: { productId: row.id, ...texture },
        update: texture,
      });
    } else {
      await prisma.productTexture.deleteMany({ where: { productId: row.id } });
    }
  }

  console.log(`▸ reviews (${reviews.length})`);
  const productIdBySlug = new Map(
    (await prisma.product.findMany({ select: { id: true, slug: true } })).map((row) => [
      row.slug,
      row.id,
    ]),
  );
  const slugById = new Map(
    buildProducts().map((product) => [product.id, product.slug] as const),
  );
  await prisma.review.deleteMany({});
  for (const review of reviews) {
    const slug = review.productId ? slugById.get(review.productId) : null;
    await prisma.review.create({
      data: {
        productId: slug ? (productIdBySlug.get(slug) ?? null) : null,
        authorName: review.authorName,
        city: review.city,
        rating: review.rating,
        title: review.title,
        body: review.body,
        approved: review.approved,
        createdAt: new Date(review.createdAt),
      },
    });
  }

  console.log(`▸ coupons (${coupons.length})`);
  for (const coupon of coupons) {
    const data = {
      code: coupon.code,
      kind: coupon.kind,
      value: coupon.value,
      minSubtotal: coupon.minSubtotal,
      active: coupon.active,
      expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt) : null,
    };
    await prisma.coupon.upsert({
      where: { code: coupon.code },
      create: data,
      update: data,
    });
  }

  /*
   * The room designer's object library.
   *
   * Upserted by a stable key rather than recreated, so a seed re-run does not
   * orphan the assets an administrator has already linked to catalogue
   * products — the link is the valuable part and it lives on the asset row.
   *
   * Nothing is seeded as `soldOnSite`. These are drawings; an item only
   * becomes purchasable when someone links it to a real product, and until
   * then the designer labels it for illustration only.
   */
  console.log(
    `\u25b8 object library (${libraryCategories.length} categories, ${libraryAssets.length} assets)`,
  );
  const categoryIdByKey = new Map<string, string>();
  for (const category of libraryCategories) {
    const data = {
      key: category.key,
      name: category.name,
      sortOrder: category.sortOrder,
      enabled: true,
    };
    const row = await prisma.designObjectCategory.upsert({
      where: { key: category.key },
      create: data,
      update: { name: data.name, sortOrder: data.sortOrder },
    });
    categoryIdByKey.set(category.key, row.id);
  }

  for (const asset of libraryAssets) {
    const categoryId = categoryIdByKey.get(asset.category);
    if (!categoryId) continue;
    const existing = await prisma.designObjectAsset.findFirst({
      where: { categoryId, name: asset.name },
      select: { id: true },
    });
    const data = {
      categoryId,
      name: asset.name,
      assetUrl: objectAssetUrl(asset.slug),
      realWidthCm: asset.widthCm,
      realHeightCm: asset.heightCm,
      snap: asset.snap,
      sortOrder: asset.sortOrder,
    };
    if (existing) {
      // `soldOnSite` and `productId` are left alone: they are an
      // administrator's decision, not the seed's.
      await prisma.designObjectAsset.update({ where: { id: existing.id }, data });
    } else {
      await prisma.designObjectAsset.create({
        data: { ...data, soldOnSite: false, productId: null, enabled: true },
      });
    }
  }

  /*
   * Accounts.
   *
   * In production the admin credentials must be supplied explicitly and the
   * demo customer is not created at all — a published store with a documented
   * login is an open door, and "we meant to change it" is how it stays open.
   */
  const isProductionSeed =
    process.env.NODE_ENV === "production" || process.env.SEED_MODE === "production";

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (isProductionSeed) {
    if (!adminEmail || !adminPassword) {
      throw new Error(
        "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required for a production seed.",
      );
    }
    if (adminPassword.length < 12) {
      throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters.");
    }
  }

  console.log(isProductionSeed ? "▸ admin account" : "▸ staff + demo accounts");
  const accounts = [
    {
      email: adminEmail ?? "admin@terranova.example",
      password: adminPassword ?? "TerraNova!2026",
      fullName: "צוות הניהול",
      role: "ADMIN" as const,
    },
    ...(isProductionSeed
      ? []
      : [
          {
            email: "noa@example.com",
            password: "Demo!2026",
            fullName: "נועה ברקוביץ׳",
            role: "CUSTOMER" as const,
          },
        ]),
  ];
  for (const account of accounts) {
    const data = {
      email: account.email.toLowerCase(),
      passwordHash: hashSync(account.password, 10),
      fullName: account.fullName,
      role: account.role,
    };
    await prisma.user.upsert({
      where: { email: data.email },
      create: data,
      update: { fullName: data.fullName, role: data.role },
    });
  }

  console.log("✓ seed complete");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
