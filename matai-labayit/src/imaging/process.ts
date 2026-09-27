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
  return { cutout, cutoutW: bw, cutoutH: bh, mask: maskRef, cutoutScale: hi.width / photo.width() };
}

/** תצוגה מקדימה מהירה של החיתוך ברזולוציית העבודה. */
export const previewCutout = (px: Pixels, mask: Mask) => imageFromPixels(applyMask(px, mask));

/**
 * ניקוי תאורת החנות מהדוגמה: מחלקים בתאורה בתדר נמוך (מפת בהירות מטושטשת מאוד),
 * כך שזרקור/הצללה בצילום החנות לא יחזרו על עצמם בכל אריח על הקיר.
 */
export function flattenLighting(px: Pixels, strength = 0.85): Pixels {
  const { width: w, height: h, data } = px;
  const n = w * h;
  const lum = (d: Uint8Array, i: number) => 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  // הערכת התאורה: ממוצע אמיתי בבלוקים של 6×6 ואינטרפולציה בילינארית. (הקטנה ישירה של התמונה דוגמת
  // פיקסלים בודדים – ברפפות/פוגות היא נופלת על חריץ כהה ו"מלבינה" עמודות שלמות.)
  const G = 6;
  const sums = new Float64Array(G * G);
  const cnts = new Float64Array(G * G);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const b = Math.min(G - 1, Math.floor((y * G) / h)) * G + Math.min(G - 1, Math.floor((x * G) / w));
      sums[b] += lum(data, y * w + x);
      cnts[b]++;
    }
  const cell = (cx: number, cy: number) => {
    const b = Math.max(0, Math.min(G - 1, cy)) * G + Math.max(0, Math.min(G - 1, cx));
    return cnts[b] ? sums[b] / cnts[b] : 128;
  };
  const light = new Float32Array(n);
  let mean = 0;
  for (let y = 0; y < h; y++) {
    const fy = ((y + 0.5) * G) / h - 0.5;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = ((x + 0.5) * G) / w - 0.5;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const v = (cell(x0, y0) * (1 - tx) + cell(x0 + 1, y0) * tx) * (1 - ty) + (cell(x0, y0 + 1) * (1 - tx) + cell(x0 + 1, y0 + 1) * tx) * ty;
      light[y * w + x] = v;
      mean += v;
    }
  }
  mean /= n;
  const out = new Uint8Array(data.length);
  for (let i = 0; i < n; i++) {
    const f = Math.pow(mean / Math.max(8, light[i]), strength);
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.max(0, Math.min(255, Math.round(data[i * 4 + c] * f)));
    out[i * 4 + 3] = 255;
  }
  return { data: out, width: w, height: h };
}

/** הפיכת טקסטורה רציפה (אבן, טיח, בד) לחוזרת בלי תפרים: מיזוג עם עותק מוזז בחצי. */
export function makeSeamless(px: Pixels): Pixels {
  const { width: w, height: h, data } = px;
  const out = new Uint8Array(data.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const j = (((y + (h >> 1)) % h) * w + ((x + (w >> 1)) % w)) * 4;
      // משקל המקור: 1 במרכז, 0 בשוליים
      const mx = 1 - Math.abs((x + 0.5) / w - 0.5) * 2;
      const my = 1 - Math.abs((y + 0.5) / h - 0.5) * 2;
      const m = Math.min(1, Math.min(mx, my) * 2.2);
      for (let c = 0; c < 3; c++) out[i + c] = Math.round(data[i + c] * m + data[j + c] * (1 - m));
      out[i + 3] = 255;
    }
  return { data: out, width: w, height: h };
}

/** חיתוך דוגמת טקסטורה מהתמונה המקורית, ניקוי תאורה ואופציונלית חזרה רציפה. */
export async function saveSwatch(photo: SkImage, sel: Rect, workW: number, opts: { flatten?: boolean; seamless?: boolean } = {}) {
  const s = photo.width() / workW;
  const src = { x: sel.x * s, y: sel.y * s, w: sel.w * s, h: sel.h * s };
  const scale = Math.min(1, 640 / Math.max(src.w, src.h));
  let img = resizeImage(photo, Math.max(8, src.w * scale), Math.max(8, src.h * scale), src);
  if (opts.flatten || opts.seamless) {
    let px = readPixels(img, Math.max(img.width(), img.height()));
    if (opts.flatten) px = flattenLighting(px);
    if (opts.seamless) px = makeSeamless(px);
    img = imageFromPixels(px);
  }
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
