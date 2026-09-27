// בניית "אריח" חוזר מדוגמת מוצר: הנחה ישרה או בהזחה (לבנים), כולל פוגות (רובה).
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

/**
 * @param groutRatio עובי הפוגה כחלק מרוחב האריח (0 = ללא)
 */
export function patternTile(swatch: SkImage, layout: PatternLayout, groutRatio: number, groutColor: string): SkImage {
  const key = `${idOf(swatch)}|${layout}|${groutRatio.toFixed(3)}|${groutColor}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const w = Math.min(512, swatch.width());
  const h = Math.round((w * swatch.height()) / swatch.width());
  const rows = layout === 'brick' ? 2 : 1;
  const surface = Skia.Surface.Make(w, h * rows);
  if (!surface) return swatch;
  const c = surface.getCanvas();
  const paint = Skia.Paint();
  const src = Skia.XYWHRect(0, 0, swatch.width(), swatch.height());
  const g = Math.round(w * groutRatio);
  const drawTile = (x: number, y: number) => {
    c.drawImageRect(swatch, src, Skia.XYWHRect(x, y, w, h), paint);
    if (g > 0) {
      const gp = Skia.Paint();
      gp.setColor(Skia.Color(groutColor));
      c.drawRect(Skia.XYWHRect(x + w - g, y, g, h), gp);
      c.drawRect(Skia.XYWHRect(x, y + h - g, w, g), gp);
    }
  };
  drawTile(0, 0);
  if (layout === 'brick') {
    drawTile(-w / 2, h);
    drawTile(w / 2, h);
  }
  surface.flush();
  const img = surface.makeImageSnapshot();
  if (cache.size > 40) cache.clear();
  cache.set(key, img);
  return img;
}
