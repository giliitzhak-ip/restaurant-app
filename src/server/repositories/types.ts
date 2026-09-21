import type {
  Availability,
  Category,
  Collection,
  Coupon,
  MaterialFamily,
  PatternType,
  Product,
  ProductSpecs,
  Review,
  StyleTag,
  SurfaceTarget,
  TextureOrientation,
  Tone,
  UsageArea,
  WaterResistance,
} from "@/types/catalog";
import type {
  Address,
  FulfilmentMethod,
  Order,
  OrderStatus,
  PaymentEvent,
  PaymentEventKind,
  Quote,
  QuoteStatus,
  User,
} from "@/types/commerce";
import type {
  RoomAnalysis,
  RoomDesignRecord,
  StoredRoomSurface,
} from "@/types/design";
import type {
  DesignObjectAsset,
  DesignScene,
  LightingPreset,
  SceneSnapTarget,
} from "@/types/scene";
import type { CartRecord } from "@/server/commerce/pricing";

export interface ProductFilter {
  categories?: string[];
  collections?: string[];
  tones?: Tone[];
  materials?: MaterialFamily[];
  styles?: StyleTag[];
  colors?: string[];
  brands?: string[];
  sizes?: string[];
  /** FLOOR or WALL — products marked BOTH match either. */
  surfaces?: Exclude<SurfaceTarget, "BOTH">[];
  water?: WaterResistance[];
  usage?: UsageArea[];
  availability?: Availability[];
  thicknessMin?: number;
  thicknessMax?: number;
  /** Price bounds are per m² where the product has one, otherwise per unit. */
  priceMin?: number;
  priceMax?: number;
  search?: string;
  featured?: boolean;
  isNew?: boolean;
  bestSeller?: boolean;
  hasTexture?: boolean;
  sampleAvailable?: boolean;
  includeInactive?: boolean;
}

export type ProductSort = "new" | "popular" | "price-asc" | "price-desc";

export interface ProductQuery extends ProductFilter {
  sort?: ProductSort;
  limit?: number;
  offset?: number;
}

export interface ProductPage {
  items: Product[];
  total: number;
}

export interface ProductInput {
  slug: string;
  sku: string;
  name: string;
  subtitle: string;
  brand: string;
  categorySlug: string;
  collectionSlug: string | null;
  description: string;
  installationNotes: string;
  maintenanceNotes: string;
  pricePerUnit: number;
  compareAtPrice: number | null;
  pricingUnit: "PACKAGE" | "ITEM";
  packageCoverageSqm: number | null;
  stockUnits: number;
  leadTimeDays: number;
  sampleAvailable: boolean;
  quoteOnly: boolean;
  featured: boolean;
  isNew: boolean;
  bestSeller: boolean;
  active: boolean;
  specs: ProductSpecs;
  images: { url: string; alt: string; kind: "STUDIO" | "ROOM" | "DETAIL" }[];
  texture: {
    imageUrl: string;
    thumbnailUrl: string;
    widthCm: number;
    heightCm: number;
    patternType: PatternType;
    repeatX: number;
    repeatY: number;
    orientation: TextureOrientation;
    scaleFactor: number;
  } | null;
}

export interface OrderInput {
  /** Entry status: PAYMENT_PENDING for a gateway, PENDING for offline settlement. */
  status: OrderStatus;
  /** Unguessable secret for the confirmation URL. */
  publicToken: string;
  /** Deduplicates a resubmitted checkout. */
  idempotencyKey: string | null;
  vatRate: number;
  currency: string;
  userId: string | null;
  customerName: string;
  phone: string;
  email: string;
  fulfilment: FulfilmentMethod;
  street: string | null;
  city: string | null;
  zip: string | null;
  floor: string | null;
  notes: string | null;
  installation: boolean;
  couponCode: string | null;
  paymentProvider: string;
  paymentReference: string | null;
  items: {
    productId: string;
    name: string;
    imageUrl: string;
    units: number;
    unitPrice: number;
    coveredSqm: number | null;
    lineTotal: number;
    designId: string | null;
  }[];
  subtotal: number;
  discount: number;
  shipping: number;
  installationTotal: number;
  total: number;
}

/**
 * Creating an order reserves stock in the same transaction that writes the
 * row, so two shoppers racing for the last package cannot both win.
 */
export type CreateOrderResult =
  | { ok: true; order: Order; duplicate?: false }
  | { ok: true; order: Order; duplicate: true }
  | {
      ok: false;
      error: "OUT_OF_STOCK";
      shortages: { productId: string; name: string; requested: number; available: number }[];
    };

export interface PaymentEventInput {
  orderId: string;
  provider: string;
  kind: PaymentEventKind;
  status: string;
  amount: number;
  currency: string;
  reference: string | null;
  /** Provider event id; a repeat of the same id is dropped. */
  eventId?: string | null;
  detail?: Record<string, unknown> | null;
}

export interface OrderTransitionInput {
  id: string;
  to: OrderStatus;
  /** Compare-and-set: the move only lands from one of these statuses. */
  expect?: OrderStatus[];
  paymentReference?: string | null;
  /** Returns reserved units to the catalogue as part of the same transaction. */
  releaseStock?: boolean;
}

export interface QuoteInput {
  userId: string | null;
  customerName: string;
  phone: string;
  email: string | null;
  city: string;
  areaSqm: number | null;
  productId: string | null;
  designId: string | null;
  imageUrl: string | null;
  wantsInstallation: boolean;
  notes: string | null;
}

export interface DesignInput {
  id?: string;
  userId: string | null;
  guestToken: string | null;
  name: string;
  originalImageUrl: string;
  renderedImageUrl: string | null;
  estimatedAreaSqm: number;
  estimatedPrice: number;
  analysis: RoomAnalysis | null;
  surfaces: StoredRoomSurface[];
  /** Objects, lighting and LED runs. Null leaves what is already stored. */
  scene: DesignScene | null;
  expiresAt: string | null;
}

export interface DesignObjectAssetInput {
  id?: string;
  categoryId: string;
  name: string;
  assetUrl: string;
  realWidthCm: number;
  realHeightCm: number;
  snap: SceneSnapTarget;
  soldOnSite: boolean;
  productId: string | null;
  sortOrder: number;
  enabled: boolean;
}

export interface DesignObjectCategoryInput {
  id?: string;
  key: string;
  name: string;
  sortOrder: number;
  enabled: boolean;
}

export interface DesignObjectCategoryRecord {
  id: string;
  key: string;
  name: string;
  sortOrder: number;
  enabled: boolean;
  assetCount: number;
}

export interface DesignVersionRecord {
  id: string;
  designId: string;
  label: string | null;
  previewUrl: string | null;
  createdAt: string;
}

export interface AdminStats {
  revenue: number;
  orders: number;
  openQuotes: number;
  designs: number;
  lowStock: number;
  customers: number;
}

/**
 * The data contract for the whole application. Two drivers implement it:
 * PostgreSQL through Prisma, and an in-memory store used when DATABASE_URL is
 * absent (local development, CI, preview builds).
 */
export interface Repository {
  readonly driver: "prisma" | "memory";

  /* catalogue */
  listCategories(): Promise<Category[]>;
  getCategory(slug: string): Promise<Category | null>;
  listCollections(): Promise<Collection[]>;
  getCollection(slug: string): Promise<Collection | null>;
  listProducts(query?: ProductQuery): Promise<ProductPage>;
  getProductBySlug(slug: string): Promise<Product | null>;
  getProductById(id: string): Promise<Product | null>;
  getProductsByIds(ids: string[]): Promise<Product[]>;
  listReviews(
    productId?: string | null,
    options?: { includeUnapproved?: boolean },
  ): Promise<Review[]>;
  /** Distinct facet values for the catalogue filter panel. */
  getFacets(): Promise<CatalogFacets>;

  /* admin catalogue */
  createProduct(input: ProductInput): Promise<Product>;
  updateProduct(id: string, input: ProductInput): Promise<Product>;
  deleteProduct(id: string): Promise<void>;
  duplicateProduct(id: string): Promise<Product>;
  setProductStock(id: string, stockUnits: number): Promise<void>;
  setReviewApproval(id: string, approved: boolean): Promise<void>;
  upsertCategory(input: Omit<Category, "id"> & { id?: string }): Promise<Category>;
  upsertCollection(input: Omit<Collection, "id"> & { id?: string }): Promise<Collection>;

  /* coupons */
  listCoupons(): Promise<Coupon[]>;
  getCoupon(code: string): Promise<Coupon | null>;
  upsertCoupon(input: Omit<Coupon, "id" | "usageCount"> & { id?: string }): Promise<Coupon>;

  /* cart */
  getCart(id: string): Promise<CartRecord | null>;
  saveCart(record: CartRecord): Promise<CartRecord>;
  deleteCart(id: string): Promise<void>;

  /* orders */
  createOrder(input: OrderInput): Promise<CreateOrderResult>;
  /** Server-side lookup. Callers must authorise before rendering anything. */
  getOrderByNumber(number: string): Promise<Order | null>;
  /** The only lookup a guest confirmation page may use. */
  getOrderByToken(number: string, token: string): Promise<Order | null>;
  findOrderByIdempotencyKey(key: string): Promise<Order | null>;
  listOrders(userId?: string | null): Promise<Order[]>;
  /** Compare-and-set status change; returns null when the guard did not match. */
  transitionOrder(input: OrderTransitionInput): Promise<Order | null>;
  /** Append-only payment log. `duplicate` marks a replayed provider event. */
  recordPaymentEvent(input: PaymentEventInput): Promise<{ duplicate: boolean }>;
  listPaymentEvents(orderId: string): Promise<PaymentEvent[]>;

  /* quotes */
  createQuote(input: QuoteInput): Promise<Quote>;
  listQuotes(userId?: string | null): Promise<Quote[]>;
  setQuoteStatus(id: string, status: QuoteStatus): Promise<void>;

  /* designs */
  saveDesign(input: DesignInput): Promise<RoomDesignRecord>;
  getDesign(id: string): Promise<RoomDesignRecord | null>;
  listDesigns(owner: { userId?: string | null; guestToken?: string | null }): Promise<
    RoomDesignRecord[]
  >;
  deleteDesign(id: string): Promise<void>;
  renameDesign(id: string, name: string): Promise<void>;
  /** Privacy: drops the stored image while keeping the product selection. */
  deleteDesignImage(id: string): Promise<void>;
  claimGuestDesigns(guestToken: string, userId: string): Promise<number>;
  /** Keeps a snapshot the customer can come back to after Undo runs out. */
  saveDesignVersion(input: {
    designId: string;
    label: string | null;
    previewUrl: string | null;
    snapshot: unknown;
  }): Promise<DesignVersionRecord>;
  listDesignVersions(designId: string): Promise<DesignVersionRecord[]>;
  getDesignVersion(
    id: string,
  ): Promise<(DesignVersionRecord & { snapshot: unknown }) | null>;
  deleteDesignVersion(id: string): Promise<void>;

  /* the object library */
  listDesignObjectCategories(options?: {
    includeDisabled?: boolean;
  }): Promise<DesignObjectCategoryRecord[]>;
  listDesignObjectAssets(options?: {
    includeDisabled?: boolean;
  }): Promise<DesignObjectAsset[]>;
  saveDesignObjectCategory(
    input: DesignObjectCategoryInput,
  ): Promise<DesignObjectCategoryRecord>;
  deleteDesignObjectCategory(id: string): Promise<void>;
  saveDesignObjectAsset(input: DesignObjectAssetInput): Promise<DesignObjectAsset>;
  deleteDesignObjectAsset(id: string): Promise<void>;
  listLightingPresets(options?: {
    includeDisabled?: boolean;
  }): Promise<LightingPreset[]>;
  saveLightingPreset(input: LightingPreset): Promise<LightingPreset>;
  deleteLightingPreset(id: string): Promise<void>;
  /** Returns the deleted count and the image URLs, so files can be removed too. */
  purgeExpiredDesigns(
    now?: Date,
  ): Promise<{ removed: number; imageUrls: string[] }>;

  /* accounts */
  createUser(input: {
    email: string;
    passwordHash: string;
    fullName: string;
    phone: string | null;
    role?: "CUSTOMER" | "ADMIN";
  }): Promise<User>;
  getUserByEmail(email: string): Promise<(User & { passwordHash: string }) | null>;
  getUserById(id: string): Promise<User | null>;
  listUsers(): Promise<User[]>;
  updateUser(id: string, input: { fullName?: string; phone?: string | null }): Promise<User>;

  /* addresses */
  listAddresses(userId: string): Promise<Address[]>;
  addAddress(input: Omit<Address, "id">): Promise<Address>;

  /* favorites */
  listFavorites(userId: string): Promise<string[]>;
  toggleFavorite(userId: string, productId: string): Promise<boolean>;

  /* admin overview */
  getAdminStats(): Promise<AdminStats>;
  listDesignsForAdmin(): Promise<RoomDesignRecord[]>;

  /* audit */
  recordAuditEvent(input: {
    actorId: string | null;
    actorEmail: string | null;
    action: string;
    entity: string;
    entityId: string | null;
    detail?: Record<string, unknown> | null;
    ip?: string | null;
  }): Promise<void>;
  listAuditEvents(limit?: number): Promise<
    {
      id: string;
      actorEmail: string | null;
      action: string;
      entity: string;
      entityId: string | null;
      createdAt: string;
    }[]
  >;

  /* marketing */
  addNewsletterSignup(input: NewsletterSignupInput): Promise<{ ok: boolean; suppressed: boolean }>;
  /** Resolves the token from an unsubscribe link and suppresses the address. */
  unsubscribeByToken(token: string): Promise<{ ok: boolean; email: string | null }>;
  suppressMarketing(email: string, reason: string): Promise<void>;
  isMarketingSuppressed(email: string): Promise<boolean>;

  /* consent */
  recordConsent(input: ConsentInput): Promise<void>;
  listConsentsForOrder(orderId: string): Promise<ConsentRecordView[]>;

  /* cancellations */
  createCancellationRequest(
    input: CancellationRequestInput,
  ): Promise<{ reference: string }>;
  listCancellationRequests(limit?: number): Promise<CancellationRequestView[]>;
  updateCancellationStatus(input: {
    id: string;
    status: CancellationStatusValue;
    decisionNote: string | null;
    handledById: string | null;
  }): Promise<boolean>;

  /* data subject requests */
  createDataRequest(input: DataRequestInput): Promise<{ reference: string }>;
  listDataRequests(limit?: number): Promise<DataRequestView[]>;
}

/* -------------------------------------------------------------------------
 * Compliance records
 * ---------------------------------------------------------------------- */

export type ConsentKindValue = "COOKIES" | "PURCHASE_TERMS" | "MARKETING";
export type ConsentSourceValue =
  | "COOKIE_BANNER"
  | "PRIVACY_SETTINGS"
  | "CHECKOUT"
  | "NEWSLETTER_FORM"
  | "ACCOUNT_SETTINGS"
  | "UNSUBSCRIBE_LINK";

export interface ConsentInput {
  kind: ConsentKindValue;
  source: ConsentSourceValue;
  granted: boolean;
  documentVersion: string;
  userId?: string | null;
  email?: string | null;
  subjectKey?: string | null;
  categories?: Record<string, boolean> | null;
  ipPrefix?: string | null;
  userAgentHash?: string | null;
  orderId?: string | null;
}

export interface ConsentRecordView {
  id: string;
  kind: ConsentKindValue;
  source: ConsentSourceValue;
  granted: boolean;
  documentVersion: string;
  categories: Record<string, boolean> | null;
  createdAt: string;
}

export interface NewsletterSignupInput {
  email: string;
  source: string;
  /** The exact wording shown beside the checkbox. */
  consentText: string;
  documentVersion: string;
  ipPrefix?: string | null;
}

export type CancellationStatusValue =
  | "RECEIVED"
  | "IN_REVIEW"
  | "APPROVED"
  | "PARTIALLY_APPROVED"
  | "DECLINED"
  | "WITHDRAWN";

export interface CancellationItemInput {
  orderItemId?: string | null;
  productName: string;
  quantity: number;
}

export interface CancellationRequestInput {
  orderNumber: string;
  orderId: string | null;
  customerName: string;
  email: string;
  phone: string;
  items: CancellationItemInput[];
  reason: string | null;
  attachmentKey: string | null;
  ipPrefix: string | null;
}

export interface CancellationRequestView {
  id: string;
  reference: string;
  orderNumber: string;
  customerName: string;
  email: string;
  phone: string;
  items: CancellationItemInput[];
  reason: string | null;
  attachmentKey: string | null;
  status: CancellationStatusValue;
  decisionNote: string | null;
  handledAt: string | null;
  createdAt: string;
}

export type DataRequestKindValue = "ACCESS" | "RECTIFY" | "DELETE" | "EXPORT";
export type DataRequestStatusValue =
  | "RECEIVED"
  | "IDENTITY_PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "REFUSED_RETENTION_REQUIRED"
  | "REJECTED";

export interface DataRequestInput {
  kind: DataRequestKindValue;
  email: string;
  userId: string | null;
  detail: string | null;
}

export interface DataRequestView {
  id: string;
  reference: string;
  kind: DataRequestKindValue;
  status: DataRequestStatusValue;
  email: string;
  detail: string | null;
  retentionBasis: string | null;
  createdAt: string;
}

export interface CatalogFacets {
  categories: { slug: string; name: string; count: number }[];
  collections: { slug: string; name: string; count: number }[];
  tones: { value: Tone; count: number }[];
  materials: { value: MaterialFamily; count: number }[];
  styles: { value: StyleTag; count: number }[];
  colors: { value: string; hex: string; count: number }[];
  brands: { value: string; count: number }[];
  sizes: { value: string; count: number }[];
  water: { value: WaterResistance; count: number }[];
  usage: { value: UsageArea; count: number }[];
  availability: { value: Availability; count: number }[];
  thickness: { min: number; max: number };
  price: { min: number; max: number };
}
