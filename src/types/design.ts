import type { TextureOrientation } from "./catalog";

/** Normalised polygon point — 0..1 relative to image width/height. */
export interface NormPoint {
  x: number;
  y: number;
}

export type SurfaceKind = "FLOOR" | "WALL" | "CEILING";

/**
 * A surface detected in (or manually marked on) a room photo.
 * Polygons are normalised so a mask stays valid at any render resolution.
 */
export interface RoomSurfaceMask {
  id: string;
  kind: SurfaceKind;
  label: string;
  /** Outer boundary of the surface. */
  polygon: NormPoint[];
  /** Areas to keep untouched (rug, furniture, window, socket). */
  holes: NormPoint[][];
  /** 0..1 — how sure the provider is. Manual masks are 1. */
  confidence: number;
  source: "AUTO" | "MANUAL";
}

export interface DetectedObject {
  kind:
    | "WINDOW"
    | "DOOR"
    | "FURNITURE"
    | "PERSON"
    | "TV"
    | "PLANT"
    | "RUG"
    | "OTHER";
  label: string;
  polygon: NormPoint[];
}

export interface RoomAnalysis {
  imageWidth: number;
  imageHeight: number;
  surfaces: RoomSurfaceMask[];
  objects: DetectedObject[];
  /** Mean luminance 0..255 — drives the low-quality warning. */
  brightness: number;
  /** Variance-of-laplacian style score; low means blurry. */
  sharpness: number;
  warnings: RoomAnalysisWarning[];
  providerId: string;
  analysedAt: string;
}

export type RoomAnalysisWarning =
  | "NO_FLOOR_DETECTED"
  | "NO_WALL_DETECTED"
  | "LOW_LIGHT"
  | "BLURRY"
  | "LOW_RESOLUTION";

/** User-controlled render settings per surface. */
export interface TextureSettings {
  orientation: TextureOrientation;
  /** Multiplier on the texture real-world size. 1 = as specified. */
  scale: number;
  /** -0.4 .. 0.4 */
  brightness: number;
  /** Pattern phase shift, 0..1 on each axis. */
  offsetX: number;
  offsetY: number;
  /** Stagger between rows for plank patterns, 0..1. */
  stagger: number;
  /** Blend strength of the original photo's shading, 0..1. */
  lightingStrength: number;
  /** Extra rotation in degrees applied on top of `orientation`. */
  rotation: number;
}

export interface SurfaceSelection {
  surfaceId: string;
  productId: string;
  settings: TextureSettings;
}

export interface RoomDesignSummary {
  id: string;
  name: string;
  userId: string | null;
  originalImageUrl: string;
  renderedImageUrl: string | null;
  floorProductId: string | null;
  floorProductName: string | null;
  wallProductId: string | null;
  wallProductName: string | null;
  estimatedAreaSqm: number;
  estimatedPrice: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

/** A surface as it was saved: mask, product and render settings. */
export interface StoredRoomSurface {
  surfaceId: string;
  kind: SurfaceKind;
  label: string;
  productId: string | null;
  mask: RoomSurfaceMask;
  settings: TextureSettings;
  areaSqm: number;
}

export interface RoomDesignRecord extends RoomDesignSummary {
  analysis: RoomAnalysis | null;
  /** Everything needed to reopen and keep editing the design. */
  surfaces: StoredRoomSurface[];
  /**
   * Owner of a design saved before sign-up. Server-only: every ownership check
   * goes through requireDesignOwnership, and nothing ships it to the browser.
   */
  guestToken: string | null;
}
