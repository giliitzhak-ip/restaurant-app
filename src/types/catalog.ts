/**
 * Domain types shared by the database layer, the API and the UI.
 * These mirror the Prisma enums 1:1 (see prisma/schema.prisma).
 */

export type SurfaceTarget = "FLOOR" | "WALL" | "BOTH";
export type WaterResistance = "WATERPROOF" | "SPLASH_PROOF" | "NOT_RESISTANT";
export type UsageArea = "INDOOR" | "OUTDOOR" | "BOTH";
export type Availability =
  | "IN_STOCK"
  | "LOW_STOCK"
  | "MADE_TO_ORDER"
  | "OUT_OF_STOCK";
export type Tone = "LIGHT" | "NATURAL" | "WARM" | "COLD" | "DARK";
export type MaterialFamily =
  | "WOOD"
  | "SPC"
  | "LAMINATE"
  | "MDF"
  | "STONE"
  | "CONCRETE"
  | "PVC"
  | "METAL";
export type StyleTag =
  | "MODERN"
  | "MINIMAL"
  | "LUXURY"
  | "WARM"
  | "SCANDINAVIAN"
  | "INDUSTRIAL"
  | "CLASSIC";

/** How a texture repeats across a surface in the room designer. */
export type PatternType = "PLANK" | "TILE" | "PANEL" | "STONE" | "CUSTOM";
export type TextureOrientation = "HORIZONTAL" | "VERTICAL" | "DIAGONAL";

export type PricingUnit = "PACKAGE" | "ITEM";

export interface ProductImage {
  id: string;
  url: string;
  alt: string;
  /** Room / lifestyle shots render larger in the gallery. */
  kind: "STUDIO" | "ROOM" | "DETAIL";
  position: number;
}

/**
 * The texture record used by the visualiser. `widthCm`/`heightCm` are the
 * real-world size of the area covered by one image tile — that is what lets
 * the engine scale the pattern correctly inside a photographed room.
 */
export interface ProductTexture {
  id: string;
  productId: string;
  imageUrl: string;
  /** Small version used for the swatch drawer; full res only on render. */
  thumbnailUrl: string;
  widthCm: number;
  heightCm: number;
  patternType: PatternType;
  repeatX: number;
  repeatY: number;
  orientation: TextureOrientation;
  scaleFactor: number;
}

export interface ProductSpecs {
  material: MaterialFamily;
  materialLabel: string;
  /** Plank / tile size in millimetres. */
  widthMm: number;
  lengthMm: number;
  thicknessMm: number;
  wearLayerMm?: number;
  colorName: string;
  colorHex: string;
  tone: Tone;
  style: StyleTag[];
  textureLabel: string;
  durability: string;
  warrantyYears: number;
  installationType: string;
  waterResistance: WaterResistance;
  usage: UsageArea;
  surface: SurfaceTarget;
  underfloorHeating?: boolean;
  acousticRating?: string;
}

export interface Product {
  id: string;
  slug: string;
  sku: string;
  name: string;
  subtitle: string;
  brand: string;
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  collectionId: string | null;
  collectionSlug: string | null;
  collectionName: string | null;
  description: string;
  installationNotes: string;
  maintenanceNotes: string;

  /** Price of one purchasable unit (a package, or a single item). */
  pricePerUnit: number;
  /** Struck-through price when on sale. */
  compareAtPrice: number | null;
  pricingUnit: PricingUnit;
  /** m² covered by one package — null for accessories sold per item. */
  packageCoverageSqm: number | null;
  /** Derived, but stored for fast sorting/filtering. */
  pricePerSqm: number | null;

  stockUnits: number;
  availability: Availability;
  leadTimeDays: number;
  sampleAvailable: boolean;
  /** Some products are quote-only (large formats, project pricing). */
  quoteOnly: boolean;

  specs: ProductSpecs;
  images: ProductImage[];
  texture: ProductTexture | null;

  featured: boolean;
  isNew: boolean;
  bestSeller: boolean;
  active: boolean;
  popularity: number;
  ratingAverage: number;
  ratingCount: number;
  createdAt: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  longDescription: string;
  heroImage: string;
  tileImage: string;
  surface: SurfaceTarget;
  position: number;
  seoTitle: string;
  seoDescription: string;
}

export interface Collection {
  id: string;
  slug: string;
  name: string;
  description: string;
  story: string;
  heroImage: string;
  featured: boolean;
  position: number;
}

export interface Review {
  id: string;
  productId: string | null;
  authorName: string;
  city: string;
  rating: number;
  title: string;
  body: string;
  createdAt: string;
  approved: boolean;
}

export interface Coupon {
  id: string;
  code: string;
  kind: "PERCENT" | "FIXED";
  value: number;
  minSubtotal: number | null;
  active: boolean;
  expiresAt: string | null;
  usageCount: number;
}

/** A product reduced to what the swatch drawer and cards need. */
export interface ProductSwatch {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  colorHex: string;
  tone: Tone;
  material: MaterialFamily;
  surface: SurfaceTarget;
  pricePerSqm: number | null;
  pricePerUnit: number;
  packageCoverageSqm: number | null;
  thumbnailUrl: string;
  textureUrl: string;
  patternType: PatternType;
  textureWidthCm: number;
  textureHeightCm: number;
  orientation: TextureOrientation;
  scaleFactor: number;
}
