// זיהוי מבנה החדר: מישורי קיר/רצפה וחפצים קיימים (להסתרה).
// בשרת עם SAM – בחירה מדויקת בנגיעה; בלי שרת – זיהוי מקומי לפי צבע, ותמיד אפשר ידנית.
import { alphaToMask, closeSeams, maskBounds, maskToPixels, regionGrow, type Mask } from '@/imaging/cutout';
import { floorQuadFromMask, quadFromMask } from '@/imaging/geometry';
import { imageFromPixels, loadSkImageFromUri, readPixels, saveSkImage, type Pixels } from '@/imaging/skiaImage';
import type { Occluder, Pt, Quad, Room } from '@/model/types';
import { cloudConfigured, segmentCloud } from '@/services/cloud';
import { uid } from '@/utils/id';

export type Detected = { mask: Mask; method: 'ai' | 'wand' };

/** זיהוי אזור מנקודת נגיעה: SAM בשרת (אם הופעל ואושר) או "שרביט" מקומי. */
export async function detectAt(room: Room, roomPx: Pixels, pt: Pt, tol: number, useCloud: boolean): Promise<Detected> {
  if (useCloud && cloudConfigured()) {
    const r = await segmentCloud(room.photo, [{ x: pt.x / room.photoW, y: pt.y / room.photoH, label: 1 }]);
    const img = await loadSkImageFromUri(`data:image/png;base64,${r.mask}`);
    const px = readPixels(img, Math.max(roomPx.width, roomPx.height));
    return { mask: resampleMask(alphaToMask(px), roomPx.width, roomPx.height), method: 'ai' };
  }
  const s = roomPx.width / room.photoW;
  const g = regionGrow(roomPx, pt.x * s, pt.y * s, tol);
  return { mask: g.mask, method: 'wand' };
}

/** התאמת מסכה לגודל אחר (שכן קרוב). */
export function resampleMask(m: Mask, w: number, h: number): Mask {
  if (m.width === w && m.height === h) return m;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) out[y * w + x] = m.data[Math.min(m.height - 1, Math.floor((y * m.height) / h)) * m.width + Math.min(m.width - 1, Math.floor((x * m.width) / w))];
  return { data: out, width: w, height: h };
}

export const saveMask = (m: Mask) => saveSkImage(imageFromPixels(maskToPixels(m)), 'png');

/** יצירת חפץ קיים (מסתיר) ממסכה. */
export async function occluderFromMask(room: Room, m: Mask, method: 'ai' | 'wand', index: number): Promise<Occluder | null> {
  const b = maskBounds(m, 128);
  if (!b || b.w * b.h < m.width * m.height * 0.002) return null;
  const s = room.photoW / m.width;
  return { id: uid(), name: `חפץ ${index}`, mask: await saveMask(m), strokes: [], bottomY: (b.y + b.h) * s, source: method };
}

/**
 * מרובע פרספקטיבה ממסכת משטח (scale = פיקסלי מסכה לפיקסל תמונה).
 * רצפה: לפי קווי הקיר-רצפה (הפינות הקרובות יכולות לצאת מהתמונה); אחרת – נקודות הקיצון.
 */
export function surfaceQuadFromMask(m: Mask, scale: number, kind: string): Quad | null {
  return (kind === 'floor' ? floorQuadFromMask(m, scale) : null) ?? quadFromMask(m, scale);
}

/** מרובע מישור מתוך מסכת קיר/רצפה. */
export function planeQuadFromMask(room: Room, m: Mask, kind: string): Quad | null {
  return surfaceQuadFromMask(m, m.width / room.photoW, kind);
}

/** "תחתית" של חפץ שסומן במברשת (הנקודה הנמוכה ביותר של המשיכות). */
export const strokesBottom = (strokes: Occluder['strokes']) =>
  strokes.reduce((mx, s) => {
    let m = mx;
    for (let i = 1; i < s.points.length; i += 2) m = Math.max(m, s.points[i] + s.radius);
    return m;
  }, 0);

/** איחוד מסכה חדשה לחפץ קיים ("הוספת חלק": רגלי שולחן, משענת וכו'). */
export async function mergeIntoOccluder(room: Room, occ: Occluder, m: Mask, loadMask: (ref: string) => Promise<Mask>): Promise<Occluder> {
  let merged = m;
  if (occ.mask) {
    const prev = resampleMask(await loadMask(occ.mask), m.width, m.height);
    const data = new Uint8Array(m.data.length);
    for (let i = 0; i < data.length; i++) data[i] = Math.max(prev.data[i], m.data[i]);
    closeSeams(data, m.width, m.height, 3); // תפר בין חלקים (משטח מואר/מוצל, רגל) – לא להשאיר סדק שקוף
    merged = { data, width: m.width, height: m.height };
  }
  const b = maskBounds(merged, 128);
  const s = room.photoW / m.width;
  return { ...occ, mask: await saveMask(merged), bottomY: Math.max(occ.bottomY, b ? (b.y + b.h) * s : 0, strokesBottom(occ.strokes)) };
}
