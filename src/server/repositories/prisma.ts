import { LOW_STOCK_AT, availabilityFor, pricePerSqmFor } from "@/data/build-catalog";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { canTransition } from "@/server/commerce/order-flow";
import { timingSafeEqualString } from "@/server/security/tokens";
import {
  generateOrderNumber,
  generateQuoteNumber,
  type CartRecord,
} from "@/server/commerce/pricing";
import type {
  Availability,
  Category,
  Collection,
  Coupon,
  Product,
  Review,
} from "@/types/catalog";
import type { Address, Order, Quote, User } from "@/types/commerce";
import type {
  RoomAnalysis,
  RoomDesignRecord,
  RoomSurfaceMask,
  TextureSettings,
} from "@/types/design";
import { buildFacets } from "./filter";
import type {
  CreateOrderResult,
  OrderTransitionInput,
  PaymentEventInput,
  ProductQuery,
  Repository,
} from "./types";

/* --------------------------- row selections --------------------------- */

const productInclude = {
  category: true,
  collection: true,
  images: { orderBy: { position: "asc" } },
  texture: true,
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

const designInclude = {
  surfaces: { include: { product: { select: { id: true, name: true } } } },
} satisfies Prisma.RoomDesignInclude;

type DesignRow = Prisma.RoomDesignGetPayload<{ include: typeof designInclude }>;

/* ------------------------------ mappers ------------------------------ */

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    sku: row.sku,
    name: row.name,
    subtitle: row.subtitle,
    brand: row.brand,
    categoryId: row.categoryId,
    categorySlug: row.category.slug,
    categoryName: row.category.name,
    collectionId: row.collectionId,
    collectionSlug: row.collection?.slug ?? null,
    collectionName: row.collection?.name ?? null,
    description: row.description,
    installationNotes: row.installationNotes,
    maintenanceNotes: row.maintenanceNotes,
    pricePerUnit: row.pricePerUnit,
    compareAtPrice: row.compareAtPrice,
    pricingUnit: row.pricingUnit,
    packageCoverageSqm: row.packageCoverageSqm,
    pricePerSqm: row.pricePerSqm,
    stockUnits: row.stockUnits,
    availability: availabilityFor({
      stockUnits: row.stockUnits,
      leadTimeDays: row.leadTimeDays,
      quoteOnly: row.quoteOnly,
    }),
    leadTimeDays: row.leadTimeDays,
    sampleAvailable: row.sampleAvailable,
    quoteOnly: row.quoteOnly,
    specs: {
      material: row.material,
      materialLabel: row.materialLabel,
      widthMm: row.widthMm,
      lengthMm: row.lengthMm,
      thicknessMm: row.thicknessMm,
      wearLayerMm: row.wearLayerMm ?? undefined,
      colorName: row.colorName,
      colorHex: row.colorHex,
      tone: row.tone,
      style: row.style,
      textureLabel: row.textureLabel,
      durability: row.durability,
      warrantyYears: row.warrantyYears,
      installationType: row.installationType,
      waterResistance: row.waterResistance,
      usage: row.usage,
      surface: row.surface,
      underfloorHeating: row.underfloorHeating,
      acousticRating: row.acousticRating ?? undefined,
    },
    images: row.images.map((image) => ({
      id: image.id,
      url: image.url,
      alt: image.alt,
      kind: image.kind,
      position: image.position,
    })),
    texture: row.texture
      ? {
          id: row.texture.id,
          productId: row.texture.productId,
          imageUrl: row.texture.imageUrl,
          thumbnailUrl: row.texture.thumbnailUrl,
          widthCm: row.texture.widthCm,
          heightCm: row.texture.heightCm,
          patternType: row.texture.patternType,
          repeatX: row.texture.repeatX,
          repeatY: row.texture.repeatY,
          orientation: row.texture.orientation,
          scaleFactor: row.texture.scaleFactor,
        }
      : null,
    featured: row.featured,
    isNew: row.isNew,
    bestSeller: row.bestSeller,
    active: row.active,
    popularity: row.popularity,
    ratingAverage: row.ratingAverage,
    ratingCount: row.ratingCount,
    createdAt: row.createdAt.toISOString(),
  };
}

function toCategory(row: Prisma.CategoryGetPayload<object>): Category {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortDescription: row.shortDescription,
    longDescription: row.longDescription,
    heroImage: row.heroImage,
    tileImage: row.tileImage,
    surface: row.surface,
    position: row.position,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
  };
}

function toCollection(row: Prisma.CollectionGetPayload<object>): Collection {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    story: row.story,
    heroImage: row.heroImage,
    featured: row.featured,
    position: row.position,
  };
}

function toReview(row: Prisma.ReviewGetPayload<object>): Review {
  return {
    id: row.id,
    productId: row.productId,
    authorName: row.authorName,
    city: row.city,
    rating: row.rating,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    approved: row.approved,
  };
}

function toCoupon(row: Prisma.CouponGetPayload<object>): Coupon {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    value: row.value,
    minSubtotal: row.minSubtotal,
    active: row.active,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    usageCount: row.usageCount,
  };
}

function toUser(row: Prisma.UserGetPayload<object>): User {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    phone: row.phone,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Thrown inside the checkout transaction so the whole thing rolls back. */
class OutOfStock extends Error {
  constructor(
    readonly shortages: {
      productId: string;
      name: string;
      requested: number;
      available: number;
    }[],
  ) {
    super("OUT_OF_STOCK");
  }
}

function toOrder(
  row: Prisma.OrderGetPayload<{
    include: { items: { include: { product: { select: { slug: true } } } } };
  }>,
  options: { withToken?: boolean } = {},
): Order {
  return {
    id: row.id,
    number: row.number,
    ...(options.withToken ? { publicToken: row.publicToken } : {}),
    userId: row.userId,
    status: row.status,
    customerName: row.customerName,
    phone: row.phone,
    email: row.email,
    fulfilment: row.fulfilment,
    street: row.street,
    city: row.city,
    zip: row.zip,
    floor: row.floor,
    notes: row.notes,
    installation: row.installation,
    items: row.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productSlug: item.product.slug,
      name: item.name,
      imageUrl: item.imageUrl,
      units: item.units,
      unitPrice: item.unitPrice,
      coveredSqm: item.coveredSqm,
      lineTotal: item.lineTotal,
      designId: item.designId,
    })),
    subtotal: row.subtotal,
    discount: row.discount,
    shipping: row.shipping,
    installationTotal: row.installationTotal,
    total: row.total,
    couponCode: row.couponCode,
    vatRate: row.vatRate,
    currency: row.currency,
    paymentProvider: row.paymentProvider,
    paymentReference: row.paymentReference,
    stockCommitted: row.stockCommitted,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toQuote(
  row: Prisma.QuoteGetPayload<{ include: { product: { select: { name: true } } } }>,
): Quote {
  return {
    id: row.id,
    number: row.number,
    userId: row.userId,
    status: row.status,
    customerName: row.customerName,
    phone: row.phone,
    email: row.email,
    city: row.city,
    areaSqm: row.areaSqm,
    productId: row.productId,
    productName: row.product?.name ?? null,
    designId: row.designId,
    imageUrl: row.imageUrl,
    wantsInstallation: row.wantsInstallation,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDesign(row: DesignRow): RoomDesignRecord {
  const floor = row.surfaces.find((s) => s.kind === "FLOOR" && s.productId);
  const wall = row.surfaces.find((s) => s.kind === "WALL" && s.productId);
  return {
    id: row.id,
    name: row.name,
    userId: row.userId,
    guestToken: row.guestToken,
    originalImageUrl: row.originalImageUrl,
    renderedImageUrl: row.renderedImageUrl,
    floorProductId: floor?.productId ?? null,
    floorProductName: floor?.product?.name ?? null,
    wallProductId: wall?.productId ?? null,
    wallProductName: wall?.product?.name ?? null,
    estimatedAreaSqm: row.estimatedAreaSqm,
    estimatedPrice: row.estimatedPrice,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    analysis: (row.analysis as unknown as RoomAnalysis | null) ?? null,
    surfaces: row.surfaces.map((surface) => {
      const mask = surface.mask as unknown as RoomSurfaceMask;
      return {
        surfaceId: mask.id,
        kind: surface.kind,
        label: surface.label,
        productId: surface.productId,
        mask,
        settings: surface.settings as unknown as TextureSettings,
        areaSqm: surface.areaSqm,
      };
    }),
  };
}

/* ------------------------------ queries ------------------------------ */

function availabilityWhere(values: Availability[]): Prisma.ProductWhereInput[] {
  return values.map((value) => {
    switch (value) {
      case "IN_STOCK":
        return { quoteOnly: false, stockUnits: { gte: LOW_STOCK_AT } };
      case "LOW_STOCK":
        return { quoteOnly: false, stockUnits: { gt: 0, lt: LOW_STOCK_AT } };
      case "OUT_OF_STOCK":
        return { quoteOnly: false, stockUnits: { lte: 0 }, leadTimeDays: { lte: 10 } };
      case "MADE_TO_ORDER":
      default:
        return {
          OR: [
            { quoteOnly: true },
            { stockUnits: { lte: 0 }, leadTimeDays: { gt: 10 } },
          ],
        };
    }
  });
}

function buildWhere(query: ProductQuery): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];

  if (!query.includeInactive) and.push({ active: true });
  if (query.categories?.length) and.push({ category: { slug: { in: query.categories } } });
  if (query.collections?.length) {
    and.push({ collection: { slug: { in: query.collections } } });
  }
  if (query.tones?.length) and.push({ tone: { in: query.tones } });
  if (query.materials?.length) and.push({ material: { in: query.materials } });
  if (query.styles?.length) and.push({ style: { hasSome: query.styles } });
  if (query.colors?.length) and.push({ colorName: { in: query.colors } });
  if (query.brands?.length) and.push({ brand: { in: query.brands } });
  if (query.sizes?.length) {
    and.push({
      OR: query.sizes.map((size) => {
        const [width, length] = size.split("x").map(Number);
        return { widthMm: width ?? 0, lengthMm: length ?? 0 };
      }),
    });
  }
  if (query.surfaces?.length) {
    and.push({ surface: { in: [...query.surfaces, "BOTH"] } });
  }
  if (query.water?.length) and.push({ waterResistance: { in: query.water } });
  if (query.usage?.length) and.push({ usage: { in: [...query.usage, "BOTH"] } });
  if (query.availability?.length) and.push({ OR: availabilityWhere(query.availability) });
  if (query.thicknessMin !== undefined || query.thicknessMax !== undefined) {
    and.push({
      thicknessMm: { gte: query.thicknessMin, lte: query.thicknessMax },
    });
  }
  if (query.priceMin !== undefined || query.priceMax !== undefined) {
    const bounds = { gte: query.priceMin, lte: query.priceMax };
    and.push({
      OR: [{ pricePerSqm: bounds }, { pricePerSqm: null, pricePerUnit: bounds }],
    });
  }
  if (query.featured !== undefined) and.push({ featured: query.featured });
  if (query.isNew !== undefined) and.push({ isNew: query.isNew });
  if (query.bestSeller !== undefined) and.push({ bestSeller: query.bestSeller });
  if (query.hasTexture) and.push({ texture: { isNot: null } });
  if (query.sampleAvailable) and.push({ sampleAvailable: true });
  if (query.search) {
    const contains = { contains: query.search, mode: "insensitive" as const };
    and.push({
      OR: [
        { name: contains },
        { subtitle: contains },
        { sku: contains },
        { brand: contains },
        { colorName: contains },
        { description: contains },
      ],
    });
  }

  return and.length ? { AND: and } : {};
}

function buildOrderBy(sort: ProductQuery["sort"]): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "new":
      return [{ createdAt: "desc" }];
    case "price-asc":
      return [{ pricePerSqm: { sort: "asc", nulls: "last" } }, { pricePerUnit: "asc" }];
    case "price-desc":
      return [{ pricePerSqm: { sort: "desc", nulls: "last" } }, { pricePerUnit: "desc" }];
    case "popular":
    default:
      return [{ popularity: "desc" }, { createdAt: "desc" }];
  }
}

/* ---------------------------- the driver ----------------------------- */

export const prismaRepository: Repository = {
  driver: "prisma",

  async listCategories() {
    const rows = await getPrisma().category.findMany({
      where: { active: true },
      orderBy: { position: "asc" },
    });
    return rows.map(toCategory);
  },

  async getCategory(slug) {
    const row = await getPrisma().category.findUnique({ where: { slug } });
    return row ? toCategory(row) : null;
  },

  async listCollections() {
    const rows = await getPrisma().collection.findMany({ orderBy: { position: "asc" } });
    return rows.map(toCollection);
  },

  async getCollection(slug) {
    const row = await getPrisma().collection.findUnique({ where: { slug } });
    return row ? toCollection(row) : null;
  },

  async listProducts(query = {}) {
    const prisma = getPrisma();
    const where = buildWhere(query);
    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: buildOrderBy(query.sort),
        skip: query.offset ?? 0,
        take: query.limit ?? undefined,
      }),
      prisma.product.count({ where }),
    ]);
    return { items: rows.map(toProduct), total };
  },

  async getProductBySlug(slug) {
    const row = await getPrisma().product.findUnique({
      where: { slug },
      include: productInclude,
    });
    return row ? toProduct(row) : null;
  },

  async getProductById(id) {
    const row = await getPrisma().product.findUnique({
      where: { id },
      include: productInclude,
    });
    return row ? toProduct(row) : null;
  },

  async getProductsByIds(ids) {
    if (!ids.length) return [];
    const rows = await getPrisma().product.findMany({
      where: { id: { in: ids } },
      include: productInclude,
    });
    return rows.map(toProduct);
  },

  async listReviews(productId, options) {
    const approved = options?.includeUnapproved ? undefined : true;
    const rows = await getPrisma().review.findMany({
      where:
        productId === undefined
          ? { approved }
          : { approved, productId: productId ?? null },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toReview);
  },

  async getFacets() {
    // The catalogue is in the hundreds of products, so one pass in memory is
    // cheaper (and far simpler) than a dozen groupBy round trips. Swap for
    // groupBy queries if it ever grows past a few thousand rows.
    const rows = await getPrisma().product.findMany({
      where: { active: true },
      include: productInclude,
    });
    return buildFacets(rows.map(toProduct));
  },

  async createProduct(input) {
    const prisma = getPrisma();
    const category = await prisma.category.findUniqueOrThrow({
      where: { slug: input.categorySlug },
    });
    const collection = input.collectionSlug
      ? await prisma.collection.findUnique({ where: { slug: input.collectionSlug } })
      : null;

    const row = await prisma.product.create({
      data: {
        slug: input.slug,
        sku: input.sku,
        name: input.name,
        subtitle: input.subtitle,
        brand: input.brand,
        description: input.description,
        installationNotes: input.installationNotes,
        maintenanceNotes: input.maintenanceNotes,
        categoryId: category.id,
        collectionId: collection?.id ?? null,
        pricePerUnit: input.pricePerUnit,
        compareAtPrice: input.compareAtPrice,
        pricingUnit: input.pricingUnit,
        packageCoverageSqm: input.packageCoverageSqm,
        pricePerSqm: pricePerSqmFor(input),
        stockUnits: input.stockUnits,
        lowStockAt: LOW_STOCK_AT,
        leadTimeDays: input.leadTimeDays,
        sampleAvailable: input.sampleAvailable,
        quoteOnly: input.quoteOnly,
        featured: input.featured,
        isNew: input.isNew,
        bestSeller: input.bestSeller,
        active: input.active,
        ...input.specs,
        wearLayerMm: input.specs.wearLayerMm ?? null,
        acousticRating: input.specs.acousticRating ?? null,
        underfloorHeating: input.specs.underfloorHeating ?? false,
        images: {
          create: input.images.map((image, index) => ({
            url: image.url,
            alt: image.alt,
            kind: image.kind,
            position: index,
          })),
        },
        texture: input.texture ? { create: input.texture } : undefined,
      },
      include: productInclude,
    });
    return toProduct(row);
  },

  async updateProduct(id, input) {
    const prisma = getPrisma();
    const category = await prisma.category.findUniqueOrThrow({
      where: { slug: input.categorySlug },
    });
    const collection = input.collectionSlug
      ? await prisma.collection.findUnique({ where: { slug: input.collectionSlug } })
      : null;

    await prisma.productImage.deleteMany({ where: { productId: id } });
    const row = await prisma.product.update({
      where: { id },
      data: {
        slug: input.slug,
        sku: input.sku,
        name: input.name,
        subtitle: input.subtitle,
        brand: input.brand,
        description: input.description,
        installationNotes: input.installationNotes,
        maintenanceNotes: input.maintenanceNotes,
        categoryId: category.id,
        collectionId: collection?.id ?? null,
        pricePerUnit: input.pricePerUnit,
        compareAtPrice: input.compareAtPrice,
        pricingUnit: input.pricingUnit,
        packageCoverageSqm: input.packageCoverageSqm,
        pricePerSqm: pricePerSqmFor(input),
        stockUnits: input.stockUnits,
        leadTimeDays: input.leadTimeDays,
        sampleAvailable: input.sampleAvailable,
        quoteOnly: input.quoteOnly,
        featured: input.featured,
        isNew: input.isNew,
        bestSeller: input.bestSeller,
        active: input.active,
        ...input.specs,
        wearLayerMm: input.specs.wearLayerMm ?? null,
        acousticRating: input.specs.acousticRating ?? null,
        underfloorHeating: input.specs.underfloorHeating ?? false,
        images: {
          create: input.images.map((image, index) => ({
            url: image.url,
            alt: image.alt,
            kind: image.kind,
            position: index,
          })),
        },
        texture: input.texture
          ? { upsert: { create: input.texture, update: input.texture } }
          : { delete: true },
      },
      include: productInclude,
    });
    return toProduct(row);
  },

  async deleteProduct(id) {
    await getPrisma().product.delete({ where: { id } });
  },

  async duplicateProduct(id) {
    const prisma = getPrisma();
    const source = await prisma.product.findUniqueOrThrow({
      where: { id },
      include: productInclude,
    });
    const {
      id: _id,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      category: _category,
      collection: _collection,
      images,
      texture,
      ...rest
    } = source;

    const row = await prisma.product.create({
      data: {
        ...rest,
        slug: `${source.slug}-copy`,
        sku: `${source.sku}-C`,
        name: `${source.name} (עותק)`,
        active: false,
        featured: false,
        images: {
          create: images.map((image) => ({
            url: image.url,
            alt: image.alt,
            kind: image.kind,
            position: image.position,
          })),
        },
        texture: texture
          ? {
              create: {
                imageUrl: texture.imageUrl,
                thumbnailUrl: texture.thumbnailUrl,
                widthCm: texture.widthCm,
                heightCm: texture.heightCm,
                patternType: texture.patternType,
                repeatX: texture.repeatX,
                repeatY: texture.repeatY,
                orientation: texture.orientation,
                scaleFactor: texture.scaleFactor,
              },
            }
          : undefined,
      },
      include: productInclude,
    });
    return toProduct(row);
  },

  async setProductStock(id, stockUnits) {
    await getPrisma().product.update({ where: { id }, data: { stockUnits } });
  },

  async setReviewApproval(id, approved) {
    await getPrisma().review.update({ where: { id }, data: { approved } });
  },

  async upsertCategory(input) {
    const { id: _ignored, ...data } = input;
    const row = await getPrisma().category.upsert({
      where: { slug: input.slug },
      create: data,
      update: data,
    });
    return toCategory(row);
  },

  async upsertCollection(input) {
    const { id: _ignored, ...data } = input;
    const row = await getPrisma().collection.upsert({
      where: { slug: input.slug },
      create: data,
      update: data,
    });
    return toCollection(row);
  },

  async listCoupons() {
    const rows = await getPrisma().coupon.findMany({ orderBy: { createdAt: "desc" } });
    return rows.map(toCoupon);
  },

  async getCoupon(code) {
    const row = await getPrisma().coupon.findFirst({
      where: { code: { equals: code.trim(), mode: "insensitive" } },
    });
    return row ? toCoupon(row) : null;
  },

  async upsertCoupon(input) {
    const data = {
      code: input.code.trim().toUpperCase(),
      kind: input.kind,
      value: input.value,
      minSubtotal: input.minSubtotal,
      active: input.active,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    };
    const row = await getPrisma().coupon.upsert({
      where: { code: data.code },
      create: data,
      update: data,
    });
    return toCoupon(row);
  },

  async getCart(id) {
    const row = await getPrisma().cart.findUnique({
      where: { id },
      include: { items: { orderBy: { createdAt: "asc" } } },
    });
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      couponCode: row.couponCode,
      installation: row.installation,
      installationSqm: row.installationSqm,
      fulfilment: row.fulfilment,
      items: row.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        units: item.units,
        requestedSqm: item.requestedSqm,
        sample: item.sample,
        designId: item.designId,
        designLabel: item.designLabel,
      })),
      updatedAt: row.updatedAt.toISOString(),
    };
  },

  async saveCart(record: CartRecord) {
    const prisma = getPrisma();
    const header = {
      userId: record.userId,
      couponCode: record.couponCode,
      installation: record.installation,
      installationSqm: record.installationSqm,
      fulfilment: record.fulfilment,
    };
    await prisma.cart.upsert({
      where: { id: record.id },
      create: { id: record.id, ...header },
      update: header,
    });
    // Whole-cart writes keep the client simple and the rows consistent.
    await prisma.cartItem.deleteMany({ where: { cartId: record.id } });
    if (record.items.length) {
      await prisma.cartItem.createMany({
        data: record.items.map((item) => ({
          id: item.id,
          cartId: record.id,
          productId: item.productId,
          units: item.units,
          requestedSqm: item.requestedSqm,
          sample: item.sample,
          designId: item.designId,
          designLabel: item.designLabel,
        })),
      });
    }
    return { ...record, updatedAt: new Date().toISOString() };
  },

  async deleteCart(id) {
    await getPrisma().cart.deleteMany({ where: { id } });
  },

  async createOrder(input): Promise<CreateOrderResult> {
    const prisma = getPrisma();
    const include = {
      items: { include: { product: { select: { slug: true } } } },
    } as const;

    if (input.idempotencyKey) {
      const existing = await prisma.order.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include,
      });
      if (existing) {
        return { ok: true, order: toOrder(existing, { withToken: true }), duplicate: true };
      }
    }

    const wanted = new Map<string, number>();
    for (const item of input.items) {
      wanted.set(item.productId, (wanted.get(item.productId) ?? 0) + item.units);
    }

    try {
      const created = await prisma.$transaction(async (tx) => {
        /*
         * Conditional decrements are the reservation: `updateMany` with a
         * `stockUnits >= units` guard either moves the row or reports zero
         * rows touched, so two checkouts racing for the last package cannot
         * both succeed. A plain read-then-write would let both through.
         */
        const shortages: {
          productId: string;
          name: string;
          requested: number;
          available: number;
        }[] = [];

        for (const [productId, units] of wanted) {
          const moved = await tx.product.updateMany({
            where: { id: productId, stockUnits: { gte: units } },
            data: { stockUnits: { decrement: units } },
          });
          if (moved.count === 0) {
            const product = await tx.product.findUnique({
              where: { id: productId },
              select: { name: true, stockUnits: true },
            });
            shortages.push({
              productId,
              name: product?.name ?? productId,
              requested: units,
              available: product?.stockUnits ?? 0,
            });
          }
        }
        if (shortages.length) throw new OutOfStock(shortages);

        // Gapless order number, allocated inside the same transaction.
        const counter = await tx.sequence.upsert({
          where: { name: "order" },
          create: { name: "order", value: 1 },
          update: { value: { increment: 1 } },
        });

        const order = await tx.order.create({
          data: {
            number: generateOrderNumber(new Date(), counter.value),
            publicToken: input.publicToken,
            idempotencyKey: input.idempotencyKey,
            status: input.status,
            vatRate: input.vatRate,
            currency: input.currency,
            stockCommitted: true,
            userId: input.userId,
            customerName: input.customerName,
            phone: input.phone,
            email: input.email,
            fulfilment: input.fulfilment,
            street: input.street,
            city: input.city,
            zip: input.zip,
            floor: input.floor,
            notes: input.notes,
            installation: input.installation,
            subtotal: input.subtotal,
            discount: input.discount,
            shipping: input.shipping,
            installationTotal: input.installationTotal,
            total: input.total,
            couponCode: input.couponCode,
            paymentProvider: input.paymentProvider,
            paymentReference: input.paymentReference,
            items: {
              create: input.items.map((item) => ({
                productId: item.productId,
                name: item.name,
                imageUrl: item.imageUrl,
                units: item.units,
                unitPrice: item.unitPrice,
                coveredSqm: item.coveredSqm,
                lineTotal: item.lineTotal,
                designId: item.designId,
              })),
            },
          },
          include,
        });

        if (input.couponCode) {
          await tx.coupon.updateMany({
            where: { code: input.couponCode.toUpperCase() },
            data: { usageCount: { increment: 1 } },
          });
        }

        return order;
      });

      return { ok: true, order: toOrder(created, { withToken: true }) };
    } catch (error) {
      if (error instanceof OutOfStock) {
        return { ok: false, error: "OUT_OF_STOCK", shortages: error.shortages };
      }
      // A unique-constraint race on idempotencyKey means someone else won.
      if (input.idempotencyKey) {
        const existing = await prisma.order.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include,
        });
        if (existing) {
          return { ok: true, order: toOrder(existing, { withToken: true }), duplicate: true };
        }
      }
      throw error;
    }
  },

  async getOrderByNumber(number) {
    const row = await getPrisma().order.findUnique({
      where: { number },
      include: { items: { include: { product: { select: { slug: true } } } } },
    });
    return row ? toOrder(row, { withToken: true }) : null;
  },

  async getOrderByToken(number, token) {
    const row = await getPrisma().order.findUnique({
      where: { number },
      include: { items: { include: { product: { select: { slug: true } } } } },
    });
    if (!row) return null;
    return timingSafeEqualString(row.publicToken, token)
      ? toOrder(row, { withToken: true })
      : null;
  },

  async findOrderByIdempotencyKey(key) {
    const row = await getPrisma().order.findUnique({
      where: { idempotencyKey: key },
      include: { items: { include: { product: { select: { slug: true } } } } },
    });
    return row ? toOrder(row, { withToken: true }) : null;
  },

  async listOrders(userId) {
    const rows = await getPrisma().order.findMany({
      where: userId ? { userId } : undefined,
      include: { items: { include: { product: { select: { slug: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => toOrder(row));
  },

  async transitionOrder(input: OrderTransitionInput) {
    const prisma = getPrisma();
    const include = {
      items: { include: { product: { select: { slug: true } } } },
    } as const;

    return prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({ where: { id: input.id } });
      if (!current) return null;
      if (input.expect && !input.expect.includes(current.status)) return null;
      if (!canTransition(current.status, input.to)) return null;

      if (input.releaseStock && current.stockCommitted) {
        const items = await tx.orderItem.findMany({
          where: { orderId: input.id },
          select: { productId: true, units: true },
        });
        for (const item of items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stockUnits: { increment: item.units } },
          });
        }
      }

      const updated = await tx.order.update({
        where: { id: input.id },
        data: {
          status: input.to,
          ...(input.paymentReference !== undefined
            ? { paymentReference: input.paymentReference }
            : {}),
          ...(input.to === "PAID" && !current.paidAt ? { paidAt: new Date() } : {}),
          ...(input.to === "CANCELLED" || input.to === "PAYMENT_FAILED"
            ? { cancelledAt: new Date() }
            : {}),
          ...(input.releaseStock && current.stockCommitted ? { stockCommitted: false } : {}),
        },
        include,
      });
      return toOrder(updated, { withToken: true });
    });
  },

  async recordPaymentEvent(input: PaymentEventInput) {
    try {
      await getPrisma().paymentTransaction.create({
        data: {
          orderId: input.orderId,
          provider: input.provider,
          kind: input.kind,
          status: input.status,
          amount: input.amount,
          currency: input.currency,
          reference: input.reference,
          eventId: input.eventId ?? null,
          detail: (input.detail ?? undefined) as never,
        },
      });
      return { duplicate: false };
    } catch {
      // The unique index on eventId turns a replayed webhook into a no-op.
      return { duplicate: true };
    }
  },

  async listPaymentEvents(orderId) {
    const rows = await getPrisma().paymentTransaction.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      orderId: row.orderId,
      provider: row.provider,
      kind: row.kind,
      status: row.status,
      amount: row.amount,
      currency: row.currency,
      reference: row.reference,
      eventId: row.eventId,
      detail: (row.detail ?? null) as Record<string, unknown> | null,
      createdAt: row.createdAt.toISOString(),
    }));
  },

  async createQuote(input) {
    const row = await getPrisma().quote.create({
      data: {
        number: generateQuoteNumber(),
        userId: input.userId,
        customerName: input.customerName,
        phone: input.phone,
        email: input.email,
        city: input.city,
        areaSqm: input.areaSqm,
        productId: input.productId,
        designId: input.designId,
        imageUrl: input.imageUrl,
        wantsInstallation: input.wantsInstallation,
        notes: input.notes,
      },
      include: { product: { select: { name: true } } },
    });
    return toQuote(row);
  },

  async listQuotes(userId) {
    const rows = await getPrisma().quote.findMany({
      where: userId ? { userId } : undefined,
      include: { product: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toQuote);
  },

  async setQuoteStatus(id, status) {
    await getPrisma().quote.update({ where: { id }, data: { status } });
  },

  async saveDesign(input) {
    const prisma = getPrisma();
    const header = {
      userId: input.userId,
      guestToken: input.guestToken,
      name: input.name,
      originalImageUrl: input.originalImageUrl,
      renderedImageUrl: input.renderedImageUrl,
      estimatedAreaSqm: input.estimatedAreaSqm,
      estimatedPrice: input.estimatedPrice,
      analysis: input.analysis
        ? (input.analysis as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    };

    const design = input.id
      ? await prisma.roomDesign.update({ where: { id: input.id }, data: header })
      : await prisma.roomDesign.create({ data: header });

    await prisma.roomSurface.deleteMany({ where: { designId: design.id } });
    if (input.surfaces.length) {
      await prisma.roomSurface.createMany({
        data: input.surfaces.map((surface) => ({
          designId: design.id,
          kind: surface.kind,
          label: surface.label,
          productId: surface.productId,
          mask: surface.mask as unknown as Prisma.InputJsonValue,
          settings: surface.settings as unknown as Prisma.InputJsonValue,
          areaSqm: surface.areaSqm,
        })),
      });
    }

    const row = await prisma.roomDesign.findUniqueOrThrow({
      where: { id: design.id },
      include: designInclude,
    });
    return toDesign(row);
  },

  async getDesign(id) {
    const row = await getPrisma().roomDesign.findUnique({
      where: { id },
      include: designInclude,
    });
    return row ? toDesign(row) : null;
  },

  async listDesigns({ userId, guestToken }) {
    if (!userId && !guestToken) return [];
    const rows = await getPrisma().roomDesign.findMany({
      where: userId ? { userId } : { guestToken, userId: null },
      include: designInclude,
      orderBy: { updatedAt: "desc" },
    });
    // The listing feeds pages that render in the browser; the guest token is
    // an httpOnly cookie value and must not ride along.
    return rows.map((row) => ({ ...toDesign(row), guestToken: null }));
  },

  async deleteDesign(id) {
    await getPrisma().roomDesign.delete({ where: { id } });
  },

  async renameDesign(id, name) {
    await getPrisma().roomDesign.update({ where: { id }, data: { name } });
  },

  async deleteDesignImage(id) {
    await getPrisma().roomDesign.update({
      where: { id },
      data: {
        originalImageUrl: "",
        renderedImageUrl: null,
        analysis: Prisma.DbNull,
      },
    });
  },

  async claimGuestDesigns(guestToken, userId) {
    const result = await getPrisma().roomDesign.updateMany({
      where: { guestToken, userId: null },
      data: { userId, guestToken: null },
    });
    return result.count;
  },

  async purgeExpiredDesigns(now = new Date()) {
    const prisma = getPrisma();
    const expired = await prisma.roomDesign.findMany({
      where: { expiresAt: { lt: now } },
      select: { id: true, originalImageUrl: true, renderedImageUrl: true },
    });
    if (!expired.length) return { removed: 0, imageUrls: [] };
    await prisma.roomDesign.deleteMany({
      where: { id: { in: expired.map((design) => design.id) } },
    });
    return {
      removed: expired.length,
      imageUrls: expired
        .flatMap((design) => [design.originalImageUrl, design.renderedImageUrl])
        .filter((url): url is string => Boolean(url)),
    };
  },

  async createUser(input) {
    const row = await getPrisma().user.create({
      data: {
        email: input.email.trim().toLowerCase(),
        passwordHash: input.passwordHash,
        fullName: input.fullName,
        phone: input.phone,
        role: input.role ?? "CUSTOMER",
      },
    });
    return toUser(row);
  },

  async getUserByEmail(email) {
    const row = await getPrisma().user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    return row ? { ...toUser(row), passwordHash: row.passwordHash } : null;
  },

  async getUserById(id) {
    const row = await getPrisma().user.findUnique({ where: { id } });
    return row ? toUser(row) : null;
  },

  async listUsers() {
    const rows = await getPrisma().user.findMany({ orderBy: { createdAt: "desc" } });
    return rows.map(toUser);
  },

  async updateUser(id, input) {
    const row = await getPrisma().user.update({ where: { id }, data: input });
    return toUser(row);
  },

  async listAddresses(userId) {
    const rows = await getPrisma().address.findMany({ where: { userId } });
    return rows.map(
      (row): Address => ({
        id: row.id,
        userId: row.userId,
        fullName: row.fullName,
        phone: row.phone,
        street: row.street,
        city: row.city,
        zip: row.zip,
        floor: row.floor,
        isDefault: row.isDefault,
      }),
    );
  },

  async addAddress(input) {
    if (!input.userId) throw new Error("An address requires a signed-in user");
    const row = await getPrisma().address.create({
      data: {
        userId: input.userId,
        fullName: input.fullName,
        phone: input.phone,
        street: input.street,
        city: input.city,
        zip: input.zip,
        floor: input.floor,
        isDefault: input.isDefault,
      },
    });
    return {
      id: row.id,
      userId: row.userId,
      fullName: row.fullName,
      phone: row.phone,
      street: row.street,
      city: row.city,
      zip: row.zip,
      floor: row.floor,
      isDefault: row.isDefault,
    };
  },

  async listFavorites(userId) {
    const rows = await getPrisma().favorite.findMany({
      where: { userId },
      select: { productId: true },
    });
    return rows.map((row) => row.productId);
  },

  async toggleFavorite(userId, productId) {
    const prisma = getPrisma();
    const existing = await prisma.favorite.findUnique({
      where: { userId_productId: { userId, productId } },
    });
    if (existing) {
      await prisma.favorite.delete({ where: { id: existing.id } });
      return false;
    }
    await prisma.favorite.create({ data: { userId, productId } });
    return true;
  },

  async getAdminStats() {
    const prisma = getPrisma();
    const revenue = await prisma.order.aggregate({
      where: { status: { not: "CANCELLED" } },
      _sum: { total: true },
    });
    const orders = await prisma.order.count();
    const openQuotes = await prisma.quote.count({
      where: { status: { in: ["NEW", "IN_PROGRESS"] } },
    });
    const designs = await prisma.roomDesign.count();
    const lowStock = await prisma.product.count({
      where: { active: true, stockUnits: { lt: LOW_STOCK_AT } },
    });
    const customers = await prisma.user.count({ where: { role: "CUSTOMER" } });
    return {
      revenue: revenue._sum.total ?? 0,
      orders,
      openQuotes,
      designs,
      lowStock,
      customers,
    };
  },

  async listDesignsForAdmin() {
    const rows = await getPrisma().roomDesign.findMany({
      include: designInclude,
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    return rows.map((row) => ({ ...toDesign(row), guestToken: null }));
  },

  async addNewsletterSignup(email) {
    const normalised = email.trim().toLowerCase();
    await getPrisma().newsletterSignup.upsert({
      where: { email: normalised },
      create: { email: normalised },
      update: {},
    });
  },

  async recordAuditEvent(input) {
    await getPrisma().auditLog.create({
      data: {
        actorId: input.actorId,
        actorEmail: input.actorEmail,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        detail: (input.detail ?? undefined) as never,
        ip: input.ip ?? null,
      },
    });
  },

  async listAuditEvents(limit = 100) {
    const rows = await getPrisma().auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(500, Math.max(1, limit)),
    });
    return rows.map((row) => ({
      id: row.id,
      actorEmail: row.actorEmail,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      createdAt: row.createdAt.toISOString(),
    }));
  },
};
