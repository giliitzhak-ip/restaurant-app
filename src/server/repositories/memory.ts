import { hashSync } from "bcryptjs";
import {
  buildCategories,
  buildCollections,
  buildCoupons,
  buildProducts,
  buildReviews,
  categoryId,
  collectionId,
  availabilityFor,
  pricePerSqmFor,
} from "@/data/build-catalog";
import {
  libraryAssets,
  libraryCategories,
  objectAssetUrl,
} from "@/data/object-library";
import { createId } from "@/lib/utils";
import { canTransition } from "@/server/commerce/order-flow";
import { timingSafeEqualString } from "@/server/security/tokens";
import {
  generateOrderNumber,
  generateQuoteNumber,
  type CartRecord,
} from "@/server/commerce/pricing";
import type {
  Category,
  Collection,
  Coupon,
  Product,
  Review,
} from "@/types/catalog";
import type {
  Address,
  Order,
  PaymentEvent,
  Quote,
  QuoteStatus,
  User,
} from "@/types/commerce";
import type { RoomDesignRecord } from "@/types/design";
import {
  emptyScene,
  type DesignObjectAsset,
  type LightingPreset,
} from "@/types/scene";
import { buildFacets, matchesFilter, sortProducts } from "./filter";
import type {
  AdminStats,
  CatalogFacets,
  DesignObjectCategoryRecord,
  DesignVersionRecord,
  CreateOrderResult,
  DesignInput,
  OrderTransitionInput,
  PaymentEventInput,
  ProductInput,
  ProductPage,
  ProductQuery,
  QuoteInput,
  CancellationRequestView,
  ConsentRecordView,
  DataRequestView,
  Repository,
} from "./types";

interface MemoryStore {
  categories: Category[];
  collections: Collection[];
  products: Product[];
  reviews: Review[];
  coupons: Coupon[];
  carts: Map<string, CartRecord>;
  orders: Order[];
  quotes: Quote[];
  designs: RoomDesignRecord[];
  designSurfaces: Map<string, DesignInput["surfaces"]>;
  designVersions: (DesignVersionRecord & { snapshot: unknown })[];
  objectCategories: DesignObjectCategoryRecord[];
  objectAssets: DesignObjectAsset[];
  lightingPresets: LightingPreset[];
  users: (User & { passwordHash: string })[];
  addresses: Address[];
  favorites: Map<string, Set<string>>;
  newsletter: Map<string, { token: string; unsubscribedAt: string | null }>;
  suppressions: Map<string, string>;
  consents: ConsentRecordView[];
  cancellations: CancellationRequestView[];
  dataRequests: DataRequestView[];
  paymentEvents: PaymentEvent[];
  audit: {
    id: string;
    actorId: string | null;
    actorEmail: string | null;
    action: string;
    entity: string;
    entityId: string | null;
    detail: Record<string, unknown> | null;
    ip: string | null;
    createdAt: string;
  }[];
  sequences: Map<string, number>;
}

/**
 * Demo accounts for the in-memory driver. Documented in README.md — they exist
 * only when the app runs without a database.
 */
const demoAccounts = [
  {
    email: "admin@terranova.example",
    password: "TerraNova!2026",
    fullName: "צוות הניהול",
    role: "ADMIN" as const,
  },
  {
    email: "noa@example.com",
    password: "Demo!2026",
    fullName: "נועה ברקוביץ׳",
    role: "CUSTOMER" as const,
  },
];

function createStore(): MemoryStore {
  const products = buildProducts();
  return {
    categories: buildCategories(),
    collections: buildCollections(),
    products,
    reviews: buildReviews(),
    coupons: buildCoupons(),
    carts: new Map(),
    orders: [],
    quotes: [],
    designs: [],
    designSurfaces: new Map(),
    designVersions: [],
    objectCategories: seedObjectCategories(),
    objectAssets: seedObjectAssets(),
    lightingPresets: seedLightingPresets(),
    users: demoAccounts.map((account, index) => ({
      id: `usr_${index + 1}`,
      email: account.email,
      fullName: account.fullName,
      phone: null,
      role: account.role,
      createdAt: new Date("2026-01-01T09:00:00.000Z").toISOString(),
      passwordHash: hashSync(account.password, 10),
    })),
    addresses: [],
    favorites: new Map(),
    newsletter: new Map(),
    suppressions: new Map(),
    consents: [],
    cancellations: [],
    dataRequests: [],
    paymentEvents: [],
    audit: [],
    sequences: new Map(),
  };
}

// Survives Next.js hot reloads so a cart does not vanish between edits.
const globalStore = globalThis as unknown as { __terraNovaStore?: MemoryStore };
const store: MemoryStore = (globalStore.__terraNovaStore ??= createStore());

const clone = <T>(value: T): T => structuredClone(value);

function productFromInput(input: ProductInput, id: string, createdAt: string): Product {
  const category = store.categories.find((c) => c.slug === input.categorySlug);
  if (!category) throw new Error(`Unknown category ${input.categorySlug}`);
  const collection = input.collectionSlug
    ? store.collections.find((c) => c.slug === input.collectionSlug)
    : undefined;

  return {
    id,
    slug: input.slug,
    sku: input.sku,
    name: input.name,
    subtitle: input.subtitle,
    brand: input.brand,
    categoryId: category.id,
    categorySlug: category.slug,
    categoryName: category.name,
    collectionId: collection?.id ?? null,
    collectionSlug: collection?.slug ?? null,
    collectionName: collection?.name ?? null,
    description: input.description,
    installationNotes: input.installationNotes,
    maintenanceNotes: input.maintenanceNotes,
    pricePerUnit: input.pricePerUnit,
    compareAtPrice: input.compareAtPrice,
    pricingUnit: input.pricingUnit,
    packageCoverageSqm: input.packageCoverageSqm,
    pricePerSqm: pricePerSqmFor(input),
    stockUnits: input.stockUnits,
    availability: availabilityFor(input),
    leadTimeDays: input.leadTimeDays,
    sampleAvailable: input.sampleAvailable,
    quoteOnly: input.quoteOnly,
    specs: input.specs,
    images: input.images.map((image, index) => ({
      id: `img_${id}_${index}`,
      url: image.url,
      alt: image.alt,
      kind: image.kind,
      position: index,
    })),
    texture: input.texture
      ? { id: `tex_${id}`, productId: id, ...input.texture }
      : null,
    featured: input.featured,
    isNew: input.isNew,
    bestSeller: input.bestSeller,
    active: input.active,
    popularity: 50,
    ratingAverage: 0,
    ratingCount: 0,
    createdAt,
  };
}

/**
 * The library, seeded from the same list the SVG generator draws from, so a
 * seeded row can never point at artwork nobody produced.
 *
 * Nothing is marked as sold. These are illustrations; an administrator links
 * one to a catalogue product when there is a real product behind it, and only
 * then does it stop saying "for illustration only".
 */
function seedObjectCategories(): DesignObjectCategoryRecord[] {
  return libraryCategories.map((category) => ({
    id: `doc-${category.key.toLowerCase()}`,
    key: category.key,
    name: category.name,
    sortOrder: category.sortOrder,
    enabled: true,
    assetCount: 0,
  }));
}

function seedObjectAssets(): DesignObjectAsset[] {
  const names = new Map(libraryCategories.map((c) => [c.key, c.name]));
  return libraryAssets.map((asset) => ({
    id: `doa-${asset.slug}`,
    category: asset.category,
    categoryName: names.get(asset.category) ?? asset.category,
    name: asset.name,
    assetUrl: objectAssetUrl(asset.slug),
    realWidthCm: asset.widthCm,
    realHeightCm: asset.heightCm,
    snap: asset.snap,
    soldOnSite: false,
    productId: null,
    productSlug: null,
    price: null,
    sortOrder: asset.sortOrder,
    enabled: true,
  }));
}

function seedLightingPresets(): LightingPreset[] {
  return [];
}

/** A version row without its payload, which is what listings show. */
function stripSnapshot(
  version: DesignVersionRecord & { snapshot: unknown },
): DesignVersionRecord {
  const { snapshot: _snapshot, ...rest } = version;
  return rest;
}

function designFrom(input: DesignInput, id: string, createdAt: string): RoomDesignRecord {
  const floor = input.surfaces.find((s) => s.kind === "FLOOR" && s.productId);
  const wall = input.surfaces.find((s) => s.kind === "WALL" && s.productId);
  const nameOf = (productId: string | null | undefined) =>
    productId ? (store.products.find((p) => p.id === productId)?.name ?? null) : null;

  return {
    id,
    name: input.name,
    userId: input.userId,
    guestToken: input.guestToken,
    originalImageUrl: input.originalImageUrl,
    renderedImageUrl: input.renderedImageUrl,
    floorProductId: floor?.productId ?? null,
    floorProductName: nameOf(floor?.productId),
    wallProductId: wall?.productId ?? null,
    wallProductName: nameOf(wall?.productId),
    estimatedAreaSqm: input.estimatedAreaSqm,
    estimatedPrice: input.estimatedPrice,
    createdAt,
    updatedAt: new Date().toISOString(),
    expiresAt: input.expiresAt,
    analysis: input.analysis,
    surfaces: clone(input.surfaces),
    scene: clone(input.scene ?? emptyScene()),
    objectCount: (input.scene?.objects ?? []).length,
    lightCount:
      (input.scene?.lightingFixtures ?? []).length +
      (input.scene?.ledPaths ?? []).length,
  };
}

export const memoryRepository: Repository = {
  driver: "memory",

  async listCategories() {
    return clone(
      [...store.categories].sort((a, b) => a.position - b.position),
    );
  },

  async getCategory(slug) {
    return clone(store.categories.find((category) => category.slug === slug) ?? null);
  },

  async listCollections() {
    return clone([...store.collections].sort((a, b) => a.position - b.position));
  },

  async getCollection(slug) {
    return clone(store.collections.find((collection) => collection.slug === slug) ?? null);
  },

  async listProducts(query: ProductQuery = {}): Promise<ProductPage> {
    const matched = store.products.filter((product) => matchesFilter(product, query));
    const sorted = sortProducts(matched, query.sort);
    const offset = query.offset ?? 0;
    const limit = query.limit ?? sorted.length;
    return {
      items: clone(sorted.slice(offset, offset + limit)),
      total: sorted.length,
    };
  },

  async getProductBySlug(slug) {
    return clone(store.products.find((product) => product.slug === slug) ?? null);
  },

  async getProductById(id) {
    return clone(store.products.find((product) => product.id === id) ?? null);
  },

  async getProductsByIds(ids) {
    const wanted = new Set(ids);
    return clone(store.products.filter((product) => wanted.has(product.id)));
  },

  async listReviews(productId, options) {
    const reviews = store.reviews.filter((review) => {
      if (!options?.includeUnapproved && !review.approved) return false;
      if (productId === undefined) return true;
      if (productId === null) return review.productId === null;
      return review.productId === productId;
    });
    return clone(
      reviews.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    );
  },

  async getFacets(): Promise<CatalogFacets> {
    return buildFacets(store.products);
  },

  async createProduct(input) {
    const id = createId("prd");
    const product = productFromInput(input, id, new Date().toISOString());
    store.products.unshift(product);
    return clone(product);
  },

  async updateProduct(id, input) {
    const index = store.products.findIndex((product) => product.id === id);
    if (index === -1) throw new Error(`Product ${id} not found`);
    const previous = store.products[index]!;
    const product = productFromInput(input, id, previous.createdAt);
    product.popularity = previous.popularity;
    product.ratingAverage = previous.ratingAverage;
    product.ratingCount = previous.ratingCount;
    store.products[index] = product;
    return clone(product);
  },

  async deleteProduct(id) {
    store.products = store.products.filter((product) => product.id !== id);
  },

  async duplicateProduct(id) {
    const source = store.products.find((product) => product.id === id);
    if (!source) throw new Error(`Product ${id} not found`);
    const newId = createId("prd");
    const copy: Product = {
      ...clone(source),
      id: newId,
      slug: `${source.slug}-copy`,
      sku: `${source.sku}-C`,
      name: `${source.name} (עותק)`,
      active: false,
      featured: false,
      createdAt: new Date().toISOString(),
      texture: source.texture ? { ...source.texture, productId: newId } : null,
    };
    store.products.unshift(copy);
    return clone(copy);
  },

  async setProductStock(id, stockUnits) {
    const product = store.products.find((item) => item.id === id);
    if (!product) return;
    product.stockUnits = stockUnits;
    product.availability = availabilityFor({
      stockUnits,
      leadTimeDays: product.leadTimeDays,
      quoteOnly: product.quoteOnly,
    });
  },

  async setReviewApproval(id, approved) {
    const review = store.reviews.find((item) => item.id === id);
    if (review) review.approved = approved;
  },

  async upsertCategory(input) {
    const id = input.id ?? categoryId(input.slug);
    const existing = store.categories.findIndex((category) => category.id === id);
    const category: Category = { ...input, id };
    if (existing === -1) store.categories.push(category);
    else store.categories[existing] = category;
    return clone(category);
  },

  async upsertCollection(input) {
    const id = input.id ?? collectionId(input.slug);
    const existing = store.collections.findIndex((collection) => collection.id === id);
    const collection: Collection = { ...input, id };
    if (existing === -1) store.collections.push(collection);
    else store.collections[existing] = collection;
    return clone(collection);
  },

  async listCoupons() {
    return clone(store.coupons);
  },

  async getCoupon(code) {
    const normalised = code.trim().toUpperCase();
    return clone(
      store.coupons.find((coupon) => coupon.code.toUpperCase() === normalised) ?? null,
    );
  },

  async upsertCoupon(input) {
    const id = input.id ?? createId("cpn");
    const index = store.coupons.findIndex((coupon) => coupon.id === id);
    const coupon: Coupon = {
      ...input,
      id,
      usageCount: index === -1 ? 0 : (store.coupons[index]!.usageCount ?? 0),
    };
    if (index === -1) store.coupons.push(coupon);
    else store.coupons[index] = coupon;
    return clone(coupon);
  },

  async getCart(id) {
    return clone(store.carts.get(id) ?? null);
  },

  async saveCart(record) {
    const next = { ...record, updatedAt: new Date().toISOString() };
    store.carts.set(record.id, next);
    return clone(next);
  },

  async deleteCart(id) {
    store.carts.delete(id);
  },

  async createOrder(input): Promise<CreateOrderResult> {
    if (input.idempotencyKey) {
      const existing = store.orders.find(
        (entry) => entry.idempotencyKey === input.idempotencyKey,
      );
      if (existing) return { ok: true, order: clone(existing), duplicate: true };
    }

    // Reserve stock first: an order that cannot be fulfilled is never written.
    const shortages: CreateOrderResult extends { shortages: infer S } ? S : never =
      [] as never;
    const wanted = new Map<string, number>();
    for (const item of input.items) {
      wanted.set(item.productId, (wanted.get(item.productId) ?? 0) + item.units);
    }
    for (const [productId, units] of wanted) {
      const product = store.products.find((entry) => entry.id === productId);
      if (!product) continue;
      if (product.stockUnits < units) {
        (shortages as unknown as { productId: string; name: string; requested: number; available: number }[]).push({
          productId,
          name: product.name,
          requested: units,
          available: product.stockUnits,
        });
      }
    }
    if ((shortages as unknown as unknown[]).length) {
      return { ok: false, error: "OUT_OF_STOCK", shortages: shortages as never };
    }

    const sequence = (store.sequences.get("order") ?? 0) + 1;
    store.sequences.set("order", sequence);

    const order: Order = {
      id: createId("ord"),
      number: generateOrderNumber(new Date(), sequence),
      publicToken: input.publicToken,
      status: input.status,
      createdAt: new Date().toISOString(),
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
      items: input.items.map((item, index) => ({
        id: `oit_${index}`,
        productId: item.productId,
        productSlug:
          store.products.find((product) => product.id === item.productId)?.slug ?? "",
        name: item.name,
        imageUrl: item.imageUrl,
        units: item.units,
        unitPrice: item.unitPrice,
        coveredSqm: item.coveredSqm,
        lineTotal: item.lineTotal,
        designId: item.designId,
      })),
      subtotal: input.subtotal,
      discount: input.discount,
      shipping: input.shipping,
      installationTotal: input.installationTotal,
      total: input.total,
      couponCode: input.couponCode,
      vatRate: input.vatRate,
      currency: input.currency,
      paymentProvider: input.paymentProvider,
      paymentReference: input.paymentReference,
      stockCommitted: true,
      paidAt: null,
      cancelledAt: null,
    };
    (order as Order & { idempotencyKey?: string | null }).idempotencyKey =
      input.idempotencyKey;

    for (const [productId, units] of wanted) {
      const product = store.products.find((entry) => entry.id === productId);
      if (!product) continue;
      product.stockUnits = Math.max(0, product.stockUnits - units);
      product.availability = availabilityFor({
        stockUnits: product.stockUnits,
        leadTimeDays: product.leadTimeDays,
        quoteOnly: product.quoteOnly,
      });
    }
    if (input.couponCode) {
      const coupon = store.coupons.find(
        (entry) => entry.code.toUpperCase() === input.couponCode!.toUpperCase(),
      );
      if (coupon) coupon.usageCount += 1;
    }

    store.orders.unshift(order);
    return { ok: true, order: clone(order) };
  },

  async getOrderByNumber(number) {
    return clone(store.orders.find((order) => order.number === number) ?? null);
  },

  async getOrderByToken(number, token) {
    const order = store.orders.find((entry) => entry.number === number);
    if (!order || !order.publicToken) return null;
    return timingSafeEqualString(order.publicToken, token) ? clone(order) : null;
  },

  async findOrderByIdempotencyKey(key) {
    const order = store.orders.find(
      (entry) => (entry as Order & { idempotencyKey?: string | null }).idempotencyKey === key,
    );
    return clone(order ?? null);
  },

  async listOrders(userId) {
    const orders = userId ? store.orders.filter((order) => order.userId === userId) : store.orders;
    // The token never leaves the confirmation path.
    return clone(orders).map(({ publicToken: _token, ...rest }) => rest as Order);
  },

  async transitionOrder(input: OrderTransitionInput) {
    const order = store.orders.find((entry) => entry.id === input.id);
    if (!order) return null;
    if (input.expect && !input.expect.includes(order.status)) return null;
    if (!canTransition(order.status, input.to)) return null;

    order.status = input.to;
    if (input.paymentReference !== undefined) order.paymentReference = input.paymentReference;
    if (input.to === "PAID" && !order.paidAt) order.paidAt = new Date().toISOString();
    if (input.to === "CANCELLED" || input.to === "PAYMENT_FAILED") {
      order.cancelledAt = new Date().toISOString();
    }

    if (input.releaseStock && order.stockCommitted) {
      for (const item of order.items) {
        const product = store.products.find((entry) => entry.id === item.productId);
        if (!product) continue;
        product.stockUnits += item.units;
        product.availability = availabilityFor({
          stockUnits: product.stockUnits,
          leadTimeDays: product.leadTimeDays,
          quoteOnly: product.quoteOnly,
        });
      }
      order.stockCommitted = false;
    }
    return clone(order);
  },

  async recordPaymentEvent(input: PaymentEventInput) {
    if (input.eventId && store.paymentEvents.some((e) => e.eventId === input.eventId)) {
      return { duplicate: true };
    }
    store.paymentEvents.unshift({
      id: createId("pay"),
      orderId: input.orderId,
      provider: input.provider,
      kind: input.kind,
      status: input.status,
      amount: input.amount,
      currency: input.currency,
      reference: input.reference,
      eventId: input.eventId ?? null,
      detail: input.detail ?? null,
      createdAt: new Date().toISOString(),
    });
    return { duplicate: false };
  },

  async listPaymentEvents(orderId) {
    return clone(store.paymentEvents.filter((event) => event.orderId === orderId));
  },

  async createQuote(input: QuoteInput) {
    const product = input.productId
      ? store.products.find((entry) => entry.id === input.productId)
      : undefined;
    const quote: Quote = {
      id: createId("qte"),
      number: generateQuoteNumber(),
      status: "NEW",
      createdAt: new Date().toISOString(),
      userId: input.userId,
      customerName: input.customerName,
      phone: input.phone,
      email: input.email,
      city: input.city,
      areaSqm: input.areaSqm,
      productId: input.productId,
      productName: product?.name ?? null,
      designId: input.designId,
      imageUrl: input.imageUrl,
      wantsInstallation: input.wantsInstallation,
      notes: input.notes,
    };
    store.quotes.unshift(quote);
    return clone(quote);
  },

  async listQuotes(userId) {
    const quotes = userId ? store.quotes.filter((quote) => quote.userId === userId) : store.quotes;
    return clone(quotes);
  },

  async setQuoteStatus(id, status: QuoteStatus) {
    const quote = store.quotes.find((entry) => entry.id === id);
    if (quote) quote.status = status;
  },

  async saveDesign(input) {
    const existingIndex = input.id
      ? store.designs.findIndex((design) => design.id === input.id)
      : -1;
    const id = input.id ?? createId("dsg");
    const createdAt =
      existingIndex === -1
        ? new Date().toISOString()
        : store.designs[existingIndex]!.createdAt;
    const kept = existingIndex === -1 ? null : store.designs[existingIndex]!.scene;
    const record = designFrom(
      { ...input, scene: input.scene ?? kept },
      id,
      createdAt,
    );
    store.designSurfaces.set(id, clone(input.surfaces));
    if (existingIndex === -1) store.designs.unshift(record);
    else store.designs[existingIndex] = record;
    return clone(record);
  },

  async getDesign(id) {
    return clone(store.designs.find((design) => design.id === id) ?? null);
  },

  async listDesigns({ userId, guestToken }) {
    const designs = store.designs.filter((design) => {
      if (userId) return design.userId === userId;
      // A guest sees only the designs saved under their own cookie.
      if (guestToken) return design.userId === null && design.guestToken === guestToken;
      return false;
    });
    return clone(designs).map(({ guestToken: _token, ...rest }) => rest as never);
  },

  async deleteDesign(id) {
    store.designs = store.designs.filter((design) => design.id !== id);
    store.designSurfaces.delete(id);
  },

  async renameDesign(id, name) {
    const design = store.designs.find((entry) => entry.id === id);
    if (design) {
      design.name = name;
      design.updatedAt = new Date().toISOString();
    }
  },

  async deleteDesignImage(id) {
    const design = store.designs.find((entry) => entry.id === id);
    if (design) {
      design.originalImageUrl = "";
      design.renderedImageUrl = null;
      design.analysis = null;
      design.updatedAt = new Date().toISOString();
    }
  },

  async saveDesignVersion({ designId, label, previewUrl, snapshot }) {
    const record = {
      id: createId("dsv"),
      designId,
      label,
      previewUrl,
      createdAt: new Date().toISOString(),
      snapshot: clone(snapshot),
    };
    store.designVersions.unshift(record);
    return clone(stripSnapshot(record));
  },

  async listDesignVersions(designId) {
    return clone(
      store.designVersions
        .filter((version) => version.designId === designId)
        .map(stripSnapshot),
    );
  },

  async getDesignVersion(id) {
    return clone(store.designVersions.find((version) => version.id === id) ?? null);
  },

  async deleteDesignVersion(id) {
    store.designVersions = store.designVersions.filter((version) => version.id !== id);
  },

  /* ----------------------------- object library ---------------------------- */

  async listDesignObjectCategories({ includeDisabled = false } = {}) {
    return clone(
      store.objectCategories
        .filter((category) => includeDisabled || category.enabled)
        .map((category) => ({
          ...category,
          assetCount: store.objectAssets.filter(
            (asset) => asset.category === category.key,
          ).length,
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    );
  },

  async listDesignObjectAssets({ includeDisabled = false } = {}) {
    const categories = new Map(
      store.objectCategories.map((category) => [category.key, category]),
    );
    return clone(
      store.objectAssets
        .filter((asset) => {
          if (!includeDisabled && !asset.enabled) return false;
          const category = categories.get(asset.category);
          return includeDisabled || (category?.enabled ?? false);
        })
        .map((asset) => {
          /*
           * Price and slug come from the catalogue every time they are read,
           * never from the library row. An asset marked as sold whose product
           * has since gone loses the claim rather than keeping a dead price.
           */
          const product = asset.productId
            ? (store.products.find((entry) => entry.id === asset.productId) ?? null)
            : null;
          return {
            ...asset,
            categoryName: categories.get(asset.category)?.name ?? asset.category,
            soldOnSite: asset.soldOnSite && Boolean(product),
            productId: product?.id ?? null,
            productSlug: product?.slug ?? null,
            price: product?.pricePerSqm ?? product?.pricePerUnit ?? null,
          };
        })
        .sort((a, b) => a.sortOrder - b.sortOrder),
    );
  },

  async saveDesignObjectCategory(input) {
    const id = input.id ?? createId("doc");
    const record: DesignObjectCategoryRecord = { ...input, id, assetCount: 0 };
    const index = store.objectCategories.findIndex((entry) => entry.id === id);
    if (index === -1) store.objectCategories.push(record);
    else store.objectCategories[index] = record;
    return clone(record);
  },

  async deleteDesignObjectCategory(id) {
    const category = store.objectCategories.find((entry) => entry.id === id);
    store.objectCategories = store.objectCategories.filter((entry) => entry.id !== id);
    if (category) {
      store.objectAssets = store.objectAssets.filter(
        (asset) => asset.category !== category.key,
      );
    }
  },

  async saveDesignObjectAsset(input) {
    const id = input.id ?? createId("doa");
    const category = store.objectCategories.find(
      (entry) => entry.id === input.categoryId,
    );
    const record: DesignObjectAsset = {
      id,
      category: category?.key ?? "CUSTOM",
      categoryName: category?.name ?? "",
      name: input.name,
      assetUrl: input.assetUrl,
      realWidthCm: input.realWidthCm,
      realHeightCm: input.realHeightCm,
      snap: input.snap,
      soldOnSite: input.soldOnSite,
      productId: input.productId,
      productSlug: null,
      price: null,
      sortOrder: input.sortOrder,
      enabled: input.enabled,
    };
    const index = store.objectAssets.findIndex((entry) => entry.id === id);
    if (index === -1) store.objectAssets.push(record);
    else store.objectAssets[index] = record;
    return clone(record);
  },

  async deleteDesignObjectAsset(id) {
    store.objectAssets = store.objectAssets.filter((asset) => asset.id !== id);
  },

  async listLightingPresets({ includeDisabled = false } = {}) {
    return clone(
      store.lightingPresets
        .filter((preset) => includeDisabled || preset.enabled)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    );
  },

  async saveLightingPreset(input) {
    const id = input.id || createId("lpr");
    const record = { ...input, id };
    const index = store.lightingPresets.findIndex((entry) => entry.id === id);
    if (index === -1) store.lightingPresets.push(record);
    else store.lightingPresets[index] = record;
    return clone(record);
  },

  async deleteLightingPreset(id) {
    store.lightingPresets = store.lightingPresets.filter((preset) => preset.id !== id);
  },

  async claimGuestDesigns(guestToken, userId) {
    let claimed = 0;
    for (const design of store.designs) {
      // Only the designs saved under this visitor's own cookie move across.
      if (design.userId === null && design.guestToken === guestToken) {
        design.userId = userId;
        design.guestToken = null;
        claimed += 1;
      }
    }
    return claimed;
  },

  async purgeExpiredDesigns(now = new Date()) {
    const expired = store.designs.filter(
      (design) => design.expiresAt && new Date(design.expiresAt) <= now,
    );
    const expiredIds = new Set(expired.map((design) => design.id));
    store.designs = store.designs.filter((design) => !expiredIds.has(design.id));
    for (const id of expiredIds) store.designSurfaces.delete(id);
    store.designVersions = store.designVersions.filter(
      (version) => !expiredIds.has(version.designId),
    );
    return {
      removed: expired.length,
      imageUrls: expired
        .flatMap((design) => [design.originalImageUrl, design.renderedImageUrl])
        .filter((url): url is string => Boolean(url)),
    };
  },

  async createUser(input) {
    const email = input.email.trim().toLowerCase();
    if (store.users.some((user) => user.email === email)) {
      throw new Error("EMAIL_TAKEN");
    }
    const user = {
      id: createId("usr"),
      email,
      fullName: input.fullName,
      phone: input.phone,
      role: input.role ?? ("CUSTOMER" as const),
      createdAt: new Date().toISOString(),
      passwordHash: input.passwordHash,
    };
    store.users.push(user);
    const { passwordHash: _hash, ...rest } = user;
    return clone(rest);
  },

  async getUserByEmail(email) {
    const normalised = email.trim().toLowerCase();
    return clone(store.users.find((user) => user.email === normalised) ?? null);
  },

  async getUserById(id) {
    const user = store.users.find((entry) => entry.id === id);
    if (!user) return null;
    const { passwordHash: _hash, ...rest } = user;
    return clone(rest);
  },

  async listUsers() {
    return clone(
      store.users.map(({ passwordHash: _hash, ...user }) => user),
    );
  },

  async updateUser(id, input) {
    const user = store.users.find((entry) => entry.id === id);
    if (!user) throw new Error(`User ${id} not found`);
    if (input.fullName !== undefined) user.fullName = input.fullName;
    if (input.phone !== undefined) user.phone = input.phone;
    const { passwordHash: _hash, ...rest } = user;
    return clone(rest);
  },

  async listAddresses(userId) {
    return clone(store.addresses.filter((address) => address.userId === userId));
  },

  async addAddress(input) {
    const address: Address = { ...input, id: createId("adr") };
    store.addresses.push(address);
    return clone(address);
  },

  async listFavorites(userId) {
    return [...(store.favorites.get(userId) ?? new Set<string>())];
  },

  async toggleFavorite(userId, productId) {
    const set = store.favorites.get(userId) ?? new Set<string>();
    const has = set.has(productId);
    if (has) set.delete(productId);
    else set.add(productId);
    store.favorites.set(userId, set);
    return !has;
  },

  async getAdminStats(): Promise<AdminStats> {
    const revenue = store.orders
      .filter((order) => order.status !== "CANCELLED")
      .reduce((sum, order) => sum + order.total, 0);
    return {
      revenue,
      orders: store.orders.length,
      openQuotes: store.quotes.filter(
        (quote) => quote.status === "NEW" || quote.status === "IN_PROGRESS",
      ).length,
      designs: store.designs.length,
      lowStock: store.products.filter(
        (product) => product.availability === "LOW_STOCK" || product.availability === "OUT_OF_STOCK",
      ).length,
      customers: store.users.filter((user) => user.role === "CUSTOMER").length,
    };
  },

  async listDesignsForAdmin() {
    return clone(store.designs);
  },

  async addNewsletterSignup(input) {
    const email = input.email.trim().toLowerCase();
    /*
     * Suppression wins over a signup, always. Otherwise "unsubscribe, then
     * re-submit the footer form by accident" quietly puts the address back on
     * the list — which is exactly the behaviour the suppression list exists to
     * prevent.
     */
    if (store.suppressions.has(email)) return { ok: true, suppressed: true };
    const existing = store.newsletter.get(email);
    store.newsletter.set(email, {
      token: existing?.token ?? createId("unsub"),
      unsubscribedAt: null,
    });
    return { ok: true, suppressed: false };
  },

  async unsubscribeByToken(token) {
    for (const [email, row] of store.newsletter) {
      if (!timingSafeEqualString(row.token, token)) continue;
      store.newsletter.set(email, { ...row, unsubscribedAt: new Date().toISOString() });
      store.suppressions.set(email, "unsubscribe-link");
      return { ok: true, email };
    }
    return { ok: false, email: null };
  },

  async suppressMarketing(email, reason) {
    const normalised = email.trim().toLowerCase();
    store.suppressions.set(normalised, reason);
    const row = store.newsletter.get(normalised);
    if (row) {
      store.newsletter.set(normalised, {
        ...row,
        unsubscribedAt: new Date().toISOString(),
      });
    }
  },

  async isMarketingSuppressed(email) {
    return store.suppressions.has(email.trim().toLowerCase());
  },

  async recordConsent(input) {
    store.consents.unshift({
      id: createId("cns"),
      kind: input.kind,
      source: input.source,
      granted: input.granted,
      documentVersion: input.documentVersion,
      categories: input.categories ?? null,
      createdAt: new Date().toISOString(),
    });
  },

  async listConsentsForOrder() {
    // The memory driver keeps no order linkage; the Prisma driver is the one
    // that has to answer this, and it does.
    return [];
  },

  async createCancellationRequest(input) {
    const reference = `CR-${new Date().getFullYear()}-${String(
      store.cancellations.length + 1,
    ).padStart(4, "0")}`;
    store.cancellations.unshift({
      id: createId("can"),
      reference,
      orderNumber: input.orderNumber,
      customerName: input.customerName,
      email: input.email,
      phone: input.phone,
      items: input.items,
      reason: input.reason,
      attachmentKey: input.attachmentKey,
      status: "RECEIVED",
      decisionNote: null,
      handledAt: null,
      createdAt: new Date().toISOString(),
    });
    return { reference };
  },

  async listCancellationRequests(limit = 100) {
    return store.cancellations.slice(0, limit);
  },

  async updateCancellationStatus(input) {
    const row = store.cancellations.find((item) => item.id === input.id);
    if (!row) return false;
    row.status = input.status;
    row.decisionNote = input.decisionNote;
    row.handledAt = new Date().toISOString();
    return true;
  },

  async createDataRequest(input) {
    const reference = `DR-${new Date().getFullYear()}-${String(
      store.dataRequests.length + 1,
    ).padStart(4, "0")}`;
    store.dataRequests.unshift({
      id: createId("dsr"),
      reference,
      kind: input.kind,
      status: "RECEIVED",
      email: input.email,
      detail: input.detail,
      retentionBasis: null,
      createdAt: new Date().toISOString(),
    });
    return { reference };
  },

  async listDataRequests(limit = 100) {
    return store.dataRequests.slice(0, limit);
  },

  async recordAuditEvent(input) {
    store.audit.unshift({
      id: createId("aud"),
      actorId: input.actorId,
      actorEmail: input.actorEmail,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      detail: input.detail ?? null,
      ip: input.ip ?? null,
      createdAt: new Date().toISOString(),
    });
    store.audit.splice(500);
  },

  async listAuditEvents(limit = 100) {
    return store.audit.slice(0, limit).map((entry) => ({
      id: entry.id,
      actorEmail: entry.actorEmail,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      createdAt: entry.createdAt,
    }));
  },
};
