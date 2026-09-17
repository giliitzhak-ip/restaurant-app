import type { NormPoint, RoomSurfaceMask } from "@/types/design";
import { polygonBBox, type BBox } from "./geometry";

export interface RasterMask {
  alpha: Uint8ClampedArray;
  bbox: BBox;
  width: number;
  height: number;
  /** Pixels covered — used for the mean-luminance pass. */
  coverage: number;
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function tracePath(
  ctx: CanvasRenderingContext2D,
  polygon: NormPoint[],
  width: number,
  height: number,
) {
  if (polygon.length < 3) return;
  ctx.moveTo(polygon[0]!.x * width, polygon[0]!.y * height);
  for (let i = 1; i < polygon.length; i += 1) {
    ctx.lineTo(polygon[i]!.x * width, polygon[i]!.y * height);
  }
  ctx.closePath();
}

/**
 * Rasterises a mask polygon (minus its holes) into an alpha map.
 *
 * Holes are what keep a rug, a sofa or a socket sitting on top of the new
 * surface instead of being painted over, and the feather keeps the boundary
 * from looking cut out with scissors.
 */
export function rasterizeMask(
  mask: RoomSurfaceMask,
  width: number,
  height: number,
  featherPx = 2,
): RasterMask {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return {
      alpha: new Uint8ClampedArray(width * height),
      bbox: { x0: 0, y0: 0, x1: 0, y1: 0 },
      width,
      height,
      coverage: 0,
    };
  }

  if (featherPx > 0) ctx.filter = `blur(${featherPx}px)`;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  tracePath(ctx, mask.polygon, width, height);
  for (const hole of mask.holes) tracePath(ctx, hole, width, height);
  ctx.fill("evenodd");
  ctx.filter = "none";

  const bbox = polygonBBox(mask.polygon, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  const alpha = new Uint8ClampedArray(width * height);
  let coverage = 0;
  for (let i = 0; i < alpha.length; i += 1) {
    const value = image.data[i * 4 + 3]!;
    alpha[i] = value;
    if (value > 8) coverage += 1;
  }

  return { alpha, bbox, width, height, coverage };
}

/** Loads a texture image and caches its pixels for repeated renders. */
const textureCache = new Map<string, ImageData>();

export async function loadTexture(url: string): Promise<ImageData> {
  const cached = textureCache.get(url);
  if (cached) return cached;

  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "sync";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`texture failed to load: ${url}`));
    image.src = url;
  });

  const canvas = createCanvas(image.naturalWidth, image.naturalHeight);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  textureCache.set(url, data);
  return data;
}

export function clearTextureCache() {
  textureCache.clear();
}
