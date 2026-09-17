import type { PatternType } from "@/types/catalog";
import type { TextureSettings } from "@/types/design";
import { applyHomography } from "./homography";
import type { SurfacePlane } from "./geometry";
import type { RasterMask } from "./mask";

export interface SurfaceTextureInput {
  data: ImageData;
  /** Real-world footprint of the texture image, in centimetres. */
  widthCm: number;
  heightCm: number;
  patternType: PatternType;
}

export interface RenderSurfaceInput {
  /** The original photo pixels — read for lighting, never written. */
  base: ImageData;
  /** The canvas being composed. */
  target: ImageData;
  mask: RasterMask;
  plane: SurfacePlane;
  texture: SurfaceTextureInput;
  settings: TextureSettings;
}

const SQRT1_2 = Math.SQRT1_2;
const luminance = (r: number, g: number, b: number) =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Lays a product texture into one masked surface of a photograph.
 *
 * Only the pixels inside the mask are touched, and each one keeps the
 * brightness relationship it had in the original photo — that is what makes
 * shadows, reflections and furniture contact survive the swap instead of
 * looking like a flat sticker.
 */
export function renderSurface({
  base,
  target,
  mask,
  plane,
  texture,
  settings,
}: RenderSurfaceInput) {
  const { width } = base;
  const { bbox, alpha } = mask;
  const basePixels = base.data;
  const outPixels = target.data;
  const texPixels = texture.data.data;
  const texW = texture.data.width;
  const texH = texture.data.height;

  // Mean luminance of the masked area — the reference the relighting is
  // measured against.
  let sum = 0;
  let count = 0;
  for (let y = bbox.y0; y < bbox.y1; y += 2) {
    for (let x = bbox.x0; x < bbox.x1; x += 2) {
      const index = y * width + x;
      if (alpha[index]! < 8) continue;
      const p = index * 4;
      sum += luminance(basePixels[p]!, basePixels[p + 1]!, basePixels[p + 2]!);
      count += 1;
    }
  }
  const meanLuma = count > 0 ? sum / count : 128;

  const scale = Math.max(0.2, settings.scale);
  const rotation = (settings.rotation * Math.PI) / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const stagger = texture.patternType === "PLANK" ? settings.stagger : 0;
  const brightness = 1 + settings.brightness;
  const lighting = Math.min(1.4, Math.max(0, settings.lightingStrength));

  const tileW = texture.widthCm * scale;
  const tileH = texture.heightCm * scale;

  for (let y = bbox.y0; y < bbox.y1; y += 1) {
    for (let x = bbox.x0; x < bbox.x1; x += 1) {
      const index = y * width + x;
      const a = alpha[index]!;
      if (a < 4) continue;

      // photo pixel -> surface plane, in centimetres
      const [planeX, planeY] = applyHomography(plane.toPlane, x + 0.5, y + 0.5);

      let u: number;
      let v: number;
      switch (settings.orientation) {
        case "VERTICAL":
          u = planeY;
          v = planeX;
          break;
        case "DIAGONAL":
          u = (planeX - planeY) * SQRT1_2;
          v = (planeX + planeY) * SQRT1_2;
          break;
        case "HORIZONTAL":
        default:
          u = planeX;
          v = planeY;
          break;
      }

      if (rotation !== 0) {
        const ru = u * cos - v * sin;
        const rv = u * sin + v * cos;
        u = ru;
        v = rv;
      }

      // Row stagger: planks in adjacent rows never start in line.
      if (stagger > 0) {
        const row = Math.floor(v / tileH);
        u += row * stagger * tileW;
      }

      u += settings.offsetX * tileW;
      v += settings.offsetY * tileH;

      let tu = (u / tileW) % 1;
      let tv = (v / tileH) % 1;
      if (tu < 0) tu += 1;
      if (tv < 0) tv += 1;

      // bilinear sample with wrap
      const fx = tu * texW - 0.5;
      const fy = tv * texH - 0.5;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const dx = fx - x0;
      const dy = fy - y0;
      const xa = ((x0 % texW) + texW) % texW;
      const ya = ((y0 % texH) + texH) % texH;
      const xb = (xa + 1) % texW;
      const yb = (ya + 1) % texH;
      const i00 = (ya * texW + xa) * 4;
      const i10 = (ya * texW + xb) * 4;
      const i01 = (yb * texW + xa) * 4;
      const i11 = (yb * texW + xb) * 4;

      const w00 = (1 - dx) * (1 - dy);
      const w10 = dx * (1 - dy);
      const w01 = (1 - dx) * dy;
      const w11 = dx * dy;

      const tr =
        texPixels[i00]! * w00 +
        texPixels[i10]! * w10 +
        texPixels[i01]! * w01 +
        texPixels[i11]! * w11;
      const tg =
        texPixels[i00 + 1]! * w00 +
        texPixels[i10 + 1]! * w10 +
        texPixels[i01 + 1]! * w01 +
        texPixels[i11 + 1]! * w11;
      const tb =
        texPixels[i00 + 2]! * w00 +
        texPixels[i10 + 2]! * w10 +
        texPixels[i01 + 2]! * w01 +
        texPixels[i11 + 2]! * w11;

      // Relight from the original photo.
      const p = index * 4;
      const sourceLuma = luminance(basePixels[p]!, basePixels[p + 1]!, basePixels[p + 2]!);
      const ratio = meanLuma > 1 ? sourceLuma / meanLuma : 1;
      const factor = Math.min(
        1.85,
        Math.max(0.3, (1 - lighting + lighting * ratio) * brightness),
      );

      const blend = a / 255;
      const rr = tr * factor;
      const gg = tg * factor;
      const bb = tb * factor;

      outPixels[p] = basePixels[p]! * (1 - blend) + rr * blend;
      outPixels[p + 1] = basePixels[p + 1]! * (1 - blend) + gg * blend;
      outPixels[p + 2] = basePixels[p + 2]! * (1 - blend) + bb * blend;
      outPixels[p + 3] = 255;
    }
  }
}

export const defaultSettings: TextureSettings = {
  orientation: "HORIZONTAL",
  scale: 1,
  brightness: 0,
  offsetX: 0,
  offsetY: 0,
  stagger: 0.42,
  lightingStrength: 0.85,
  rotation: 0,
};
