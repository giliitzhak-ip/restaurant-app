// בניית "אריח" חוזר מדוגמת מוצר: הנחה ישרה או בהזחה (לבנים), פוגות (רובה),
// ושונות טבעית – כל תא באטלס מקבל היסט אקראי בתוך הדוגמה ושינוי קל בגוון,
// כך שרצפת פרקט/אריחים לא נראית כמו אותו לוח שמשוכפל שוב ושוב.
import { Skia, type SkImage } from '@shopify/react-native-skia';
import type { PatternLayout } from '@/model/types';

const cache = new Map<string, SkImage>();
const ids = new WeakMap<SkImage, number>();
let nextId = 1;
const idOf = (img: SkImage) => {
  let id = ids.get(img);
  if (!id) {
    id = nextId++;
    ids.set(img, id);
  }
  return id;
};

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** מספר התאים באטלס (לכל כיוון) – מחזוריות החזרה. */
export const atlasCells = (variation: number) => (variation > 0.01 ? { cx: 3, cy: 4 } : { cx: 1, cy: 1 });

/**
 * @param groutRatio עובי הפוגה כחלק מרוחב האריח (0 = ללא)
 * @param variation 0..1 שונות טבעית בין אריחים
 * מחזיר תמונה שמכילה cx×cy אריחים (ראו atlasCells) – לחזרה עם ImageShader.
 */
export function patternTile(swatch: SkImage, layout: PatternLayout, groutRatio: number, groutColor: string, variation = 0): SkImage {
  const key = `${idOf(swatch)}|${layout}|${groutRatio.toFixed(3)}|${groutColor}|${variation.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const w = Math.min(384, swatch.width());
  const h = Math.max(4, Math.round((w * swatch.height()) / swatch.width()));
  const { cx, cy } = atlasCells(variation);
  const rows = layout === 'brick' ? Math.max(2, cy) : cy;
  const surface = Skia.Surface.Make(w * cx, h * rows);
  if (!surface) return swatch;
  const c = surface.getCanvas();
  const rnd = mulberry(idOf(swatch) * 7919 + 13);
  const sw = swatch.width();
  const sh = swatch.height();
  const g = Math.round(w * groutRatio);
  const gp = Skia.Paint();
  gp.setColor(Skia.Color(groutColor));

  // פרמטרים אקראיים קבועים לכל תא (שורה, עמודה) – כך שהאטלס חוזר על עצמו בלי תפרים
  const params: { k: number; warm: number; off: number; flip: boolean }[][] = [];
  for (let r = 0; r < rows; r++) {
    params.push([]);
    for (let col = 0; col < cx; col++) params[r].push({ k: 1 + (rnd() - 0.5) * 0.3 * variation, warm: (rnd() - 0.5) * 0.06 * variation, off: rnd() * sw, flip: rnd() < 0.5 });
  }
  const drawCell = (x: number, y: number, p: { k: number; warm: number; off: number; flip: boolean }) => {
    const paint = Skia.Paint();
    if (variation > 0.01) {
      const { k, warm, off, flip } = p;
      paint.setColorFilter(Skia.ColorFilter.MakeMatrix([k, 0, 0, 0, warm, 0, k, 0, 0, 0, 0, 0, k, 0, -warm, 0, 0, 0, 1, 0]));
      // היסט אקראי בתוך הדוגמה (עם גלישה) – לוחות שונים מאותה דוגמה
      c.save();
      c.clipRect(Skia.XYWHRect(x, y, w, h), 1, true);
      if (flip) {
        c.translate(x + w, y);
        c.scale(-1, 1);
        c.translate(-x, -y);
      }
      const scale = w / sw;
      c.drawImageRect(swatch, Skia.XYWHRect(off, 0, sw - off, sh), Skia.XYWHRect(x, y, (sw - off) * scale, h), paint);
      c.drawImageRect(swatch, Skia.XYWHRect(0, 0, off, sh), Skia.XYWHRect(x + (sw - off) * scale, y, off * scale, h), paint);
      c.restore();
    } else {
      c.drawImageRect(swatch, Skia.XYWHRect(0, 0, sw, sh), Skia.XYWHRect(x, y, w, h), paint);
    }
    if (g > 0) {
      c.drawRect(Skia.XYWHRect(x + w - g, y, g, h), gp);
      c.drawRect(Skia.XYWHRect(x, y + h - g, w, g), gp);
    }
  };
  for (let r = 0; r < rows; r++) {
    const shift = layout === 'brick' && r % 2 === 1 ? w / 2 : 0;
    for (let col = -1; col <= cx; col++) drawCell(col * w + shift, r * h, params[r][((col % cx) + cx) % cx]);
  }
  surface.flush();
  const img = surface.makeImageSnapshot();
  if (cache.size > 40) cache.clear();
  cache.set(key, img);
  return img;
}
