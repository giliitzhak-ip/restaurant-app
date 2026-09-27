// חישובי "ריאליזם" לעורך: התאמת תאורה בין צילום החנות לחדר, ופריסטים של תוצאות לבחירה.
import { computeMatch, neighborhood, sceneStats } from '@/imaging/harmonize';
import { loadSkImage, readPixels, type Pixels } from '@/imaging/skiaImage';
import type { ObjectLayer, Plane, Product, Room, SceneStats, SurfaceLayer } from '@/model/types';
import { getState, updateProduct } from '@/storage/db';
import { objectCorners, objectDisplayWidth } from './objectGeometry';

export const STATS_DIM = 640;

/** מאפייני צילום החנות (מחושב פעם אחת ונשמר במוצר). */
export async function ensureSceneStats(p: Product): Promise<SceneStats | undefined> {
  if (p.sceneStats) return p.sceneStats;
  if (!p.photo) return undefined;
  try {
    const px = readPixels(await loadSkImage(p.photo), STATS_DIM);
    const st = sceneStats(px);
    updateProduct(p.id, { sceneStats: st });
    return st;
  } catch {
    return undefined;
  }
}

/**
 * התאמת דוגמה (פרקט, חיפוי, טפט) לתאורת החדר: יחס החשיפה ואיזון הלבן בין צילום החנות לחדר כולו.
 * משנה רק בהירות/גוון כלליים – לא את הדוגמה עצמה.
 */
export async function computeSurfaceMatch(l: SurfaceLayer, roomPx: Pixels): Promise<SurfaceLayer['match'] | undefined> {
  const p = l.productId ? getState().products[l.productId] : undefined;
  if (!p || l.mode !== 'pattern') return undefined;
  const store = await ensureSceneStats(p);
  if (!store) return undefined;
  const m = computeMatch(store, sceneStats(roomPx), 1);
  return { ...m, blur: 0, grain: 0 };
}

/** ההתאמה המלאה של אובייקט לסביבתו בחדר (לפי מיקומו הנוכחי). */
export async function computeLayerMatch(l: ObjectLayer, room: Room, roomPx: Pixels, planes?: Plane[]): Promise<ObjectLayer['match'] | undefined> {
  const p = getState().products[l.productId];
  if (!p) return undefined;
  const store = await ensureSceneStats(p);
  if (!store) return undefined;
  const aspect = p.cutoutW && p.cutoutH ? p.cutoutH / p.cutoutW : 1;
  const q = objectCorners(l, aspect, planes);
  const s = roomPx.width / room.photoW;
  const xs = q.map((c) => c.x);
  const ys = q.map((c) => c.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const center = { x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2 };
  const region = neighborhood({ x: center.x * s, y: center.y * s }, w * s, h * s, roomPx.width, roomPx.height);
  const roomStats = sceneStats(roomPx, region);
  // רוחב המוצר בשני הצילומים, באותה רזולוציית ניתוח
  const inRoom = objectDisplayWidth(q) * s;
  const photoScale = STATS_DIM / Math.max(p.photoW ?? 1, p.photoH ?? 1);
  const maxDim = Math.max(p.photoW ?? 1, p.photoH ?? 1);
  const cutScale = p.cutoutScale ?? Math.min(1, 1400 / maxDim);
  const inStore = ((p.cutoutW ?? p.photoW ?? 1) / cutScale) * photoScale;
  return computeMatch(store, roomStats, inRoom / Math.max(1, inStore));
}

export type Variant = { key: string; label: string; hint: string; apply: (l: ObjectLayer) => ObjectLayer };

/** כמה תוצאות לבחירה – שונות רק בהשתלבות ובצל, לעולם לא במוצר עצמו. */
export const VARIANTS: Variant[] = [
  {
    key: 'faithful',
    label: 'נאמן למקור',
    hint: 'המוצר בדיוק כפי שצולם',
    apply: (l) => ({ ...l, harmonize: 0, shadow: { ...l.shadow, cast: 0.35, contact: 0.55, length: 0.4, angle: -30 } }),
  },
  {
    key: 'balanced',
    label: 'מאוזן',
    hint: 'התאמת תאורה עדינה',
    apply: (l) => ({ ...l, harmonize: 0.4, shadow: { ...l.shadow, cast: 0.5, contact: 0.6, length: 0.45, angle: -35 } }),
  },
  {
    key: 'blended',
    label: 'משתלב',
    hint: 'תאורה, חדות וגרעיניות כמו בחדר',
    apply: (l) => ({ ...l, harmonize: 0.85, shadow: { ...l.shadow, cast: 0.6, contact: 0.7, length: 0.5, angle: -40 } }),
  },
  {
    key: 'window',
    label: 'אור מהחלון',
    hint: 'צל ארוך ורך לצד',
    apply: (l) => ({ ...l, harmonize: 0.6, shadow: { ...l.shadow, cast: 0.55, contact: 0.65, length: 0.9, angle: 55, blur: l.shadow.blur * 1.6 } }),
  },
];
