// פעולות עיבוד ברמה גבוהה שמשלבות את האלגוריתמים עם שמירה במאגר.
import { Skia, type SkImage } from '@shopify/react-native-skia';
import { applyMask, maskBounds, maskToPixels, type Mask, type Rect } from './cutout';
import { imageFromPixels, readPixels, resizeImage, saveSkImage, type Pixels } from './skiaImage';

/** דגימה בילינארית של מסכה בגודל אחר. */
function sampleMask(mask: Mask, x: number, y: number): number {
  const { data, width: w, height: h } = mask;
  const fx = Math.max(0, Math.min(w - 1, x));
  const fy = Math.max(0, Math.min(h - 1, y));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const a = data[y0 * w + x0] * (1 - tx) + data[y0 * w + x1] * tx;
  const b = data[y1 * w + x0] * (1 - tx) + data[y1 * w + x1] * tx;
  return a * (1 - ty) + b * ty;
}

/**
 * שמירת החיתוך: מחילים את המסכה על גרסה ברזולוציה גבוהה יותר של התמונה,
 * חותכים לגבולות המוצר ושומרים PNG שקוף + את המסכה (לעריכה חוזרת).
 */
export async function saveCutout(photo: SkImage, mask: Mask, maxDim = 1400) {
  const bounds = maskBounds(mask, 24);
  if (!bounds) throw new Error('החיתוך ריק – סמנו את המוצר מחדש או השתמשו במברשת "שחזור".');
  const hi: Pixels = readPixels(photo, maxDim);
  const sx = mask.width / hi.width;
  const sy = mask.height / hi.height;
  const bx = Math.max(0, Math.floor((bounds.x - 2) / sx));
  const by = Math.max(0, Math.floor((bounds.y - 2) / sy));
  const bw = Math.min(hi.width - bx, Math.ceil((bounds.w + 4) / sx));
  const bh = Math.min(hi.height - by, Math.ceil((bounds.h + 4) / sy));
  const out = new Uint8Array(bw * bh * 4);
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const si = ((by + y) * hi.width + (bx + x)) * 4;
      const di = (y * bw + x) * 4;
      out[di] = hi.data[si];
      out[di + 1] = hi.data[si + 1];
      out[di + 2] = hi.data[si + 2];
      out[di + 3] = Math.min(hi.data[si + 3], Math.round(sampleMask(mask, (bx + x + 0.5) * sx - 0.5, (by + y + 0.5) * sy - 0.5)));
    }
  const cutImg = imageFromPixels({ data: out, width: bw, height: bh });
  const cutout = await saveSkImage(cutImg, 'png');
  const maskRef = await saveSkImage(imageFromPixels(maskToPixels(mask)), 'png');
  return { cutout, cutoutW: bw, cutoutH: bh, mask: maskRef };
}

/** תצוגה מקדימה מהירה של החיתוך ברזולוציית העבודה. */
export const previewCutout = (px: Pixels, mask: Mask) => imageFromPixels(applyMask(px, mask));

/** חיתוך דוגמת טקסטורה מהתמונה המקורית. */
export async function saveSwatch(photo: SkImage, sel: Rect, workW: number) {
  const s = photo.width() / workW;
  const src = { x: sel.x * s, y: sel.y * s, w: sel.w * s, h: sel.h * s };
  const scale = Math.min(1, 640 / Math.max(src.w, src.h));
  const img = resizeImage(photo, Math.max(8, src.w * scale), Math.max(8, src.h * scale), src);
  const ref = await saveSkImage(img, 'jpg', 90);
  return { swatch: ref, swatchW: img.width(), swatchH: img.height() };
}

/** יצירת אריח שחמט להצגת שקיפות. */
let checker: SkImage | null = null;
export function checkerTile(): SkImage {
  if (checker) return checker;
  const s = Skia.Surface.Make(24, 24)!;
  const c = s.getCanvas();
  const p1 = Skia.Paint();
  p1.setColor(Skia.Color('#FFFFFF'));
  const p2 = Skia.Paint();
  p2.setColor(Skia.Color('#E4DED4'));
  c.drawRect(Skia.XYWHRect(0, 0, 24, 24), p1);
  c.drawRect(Skia.XYWHRect(0, 0, 12, 12), p2);
  c.drawRect(Skia.XYWHRect(12, 12, 12, 12), p2);
  s.flush();
  checker = s.makeImageSnapshot();
  return checker;
}
