import type {
  DetectedObject,
  RoomAnalysis,
  RoomSurfaceMask,
  SurfaceKind,
  TextureSettings,
} from "@/types/design";

/**
 * What a vision provider receives.
 *
 * `preview` is a small RGBA thumbnail the browser produced — enough for a
 * heuristic provider and cheap to send. `bytes` carries the full image and is
 * only populated for providers that need it (a hosted segmentation model), so
 * the default setup never ships a customer's full-resolution photo anywhere.
 */
export interface RoomImageInput {
  width: number;
  height: number;
  preview: {
    width: number;
    height: number;
    /** RGBA, row major, length = width * height * 4. */
    rgba: Uint8ClampedArray | number[];
  };
  bytes?: Uint8Array;
  contentType?: string;
  /** Set when the image has already been stored and the provider can fetch it. */
  imageUrl?: string;
}

export interface RenderTextureRequest {
  image: RoomImageInput;
  mask: RoomSurfaceMask;
  texture: { url: string; widthCm: number; heightCm: number };
  settings: TextureSettings;
}

/**
 * Room vision provider.
 *
 * The product is deliberately not tied to one AI vendor: the mock provider
 * ships by default, a hosted segmentation model can be configured with two
 * environment variables, and `renderTexture` exists so a provider that
 * composites server-side can take over from the browser engine.
 */
export interface RoomVisionProvider {
  readonly id: string;
  /** Human-readable, shown in the admin diagnostics. */
  readonly label: string;

  analyzeRoom(image: RoomImageInput): Promise<RoomAnalysis>;
  segmentFloor(image: RoomImageInput): Promise<RoomSurfaceMask | null>;
  segmentWalls(image: RoomImageInput): Promise<RoomSurfaceMask[]>;
  generateMask(
    image: RoomImageInput,
    surface: SurfaceKind,
  ): Promise<RoomSurfaceMask | null>;
  /**
   * Optional server-side compositing. Returning null (the default) means the
   * browser engine renders, which keeps interaction instant.
   */
  renderTexture?(request: RenderTextureRequest): Promise<{ imageUrl: string } | null>;
}

export type { DetectedObject, RoomAnalysis, RoomSurfaceMask, SurfaceKind };
