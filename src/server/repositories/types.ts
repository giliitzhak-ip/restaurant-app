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
  Quote,
  QuoteStatus,
  User,
} from "@/types/commerce";
import type {
  RoomAnalysis,
  RoomDesignRecord,
  StoredRoomSurface,
} from "@/types/design";
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
  expiresAt: string | null;
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
  createOrder(input: OrderInput): Promise<Order>;
  getOrderByNumber(number: string): Promise<Order | null>;
  listOrders(userId?: string | null): Promise<Order[]>;
  setOrderStatus(id: string, status: OrderStatus): Promise<void>;

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

  /* marketing */
  addNewsletterSignup(email: string): Promise<void>;
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
