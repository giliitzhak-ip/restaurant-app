// גאומטריה: הומוגרפיה (פרספקטיבה) ממלבן שטוח למרובע על התמונה, ועוד.
import type { Pt } from '@/model/types';

/** מידות "המשטח השטוח" שממופה למרובע – בערך אורכי הצלעות. */
export function quadRectSize(q: Pt[]): { W: number; H: number } {
  const d = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  return {
    W: Math.max(1, (d(q[0], q[1]) + d(q[3], q[2])) / 2),
    H: Math.max(1, (d(q[0], q[3]) + d(q[1], q[2])) / 2),
  };
}

/**
 * מטריצה 3x3 (סדר שורות, כמו ב-Skia) שממפה את המלבן (0,0)-(W,H) לארבע הפינות:
 * q[0]=עליונה-שמאלית, q[1]=עליונה-ימנית, q[2]=תחתונה-ימנית, q[3]=תחתונה-שמאלית.
 */
export function rectToQuad(W: number, H: number, q: Pt[]): number[] {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  let a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    a = p1.x - p0.x;
    b = p2.x - p1.x;
    c = p0.x;
    d = p1.y - p0.y;
    e = p2.y - p1.y;
    f = p0.y;
    g = 0;
    h = 0;
  } else {
    const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
    a = p1.x - p0.x + g * p1.x;
    b = p3.x - p0.x + h * p3.x;
    c = p0.x;
    d = p1.y - p0.y + g * p1.y;
    e = p3.y - p0.y + h * p3.y;
    f = p0.y;
  }
  return [a / W, b / H, c, d / W, e / H, f, g / W, h / H, 1];
}

export function applyMatrix(m: number[], x: number, y: number): Pt {
  const w = m[6] * x + m[7] * y + m[8];
  return { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w };
}

/** מרובע ברירת מחדל לפי סוג המשטח (אפשר לגרור את הפינות לדיוק). */
export function defaultQuad(target: 'wall' | 'floor' | 'ceiling' | 'other', W: number, H: number): [Pt, Pt, Pt, Pt] {
  switch (target) {
    case 'floor':
      return [
        { x: W * 0.18, y: H * 0.66 },
        { x: W * 0.82, y: H * 0.66 },
        { x: W * 1.0, y: H * 0.98 },
        { x: W * 0.0, y: H * 0.98 },
      ];
    case 'ceiling':
      return [
        { x: 0, y: H * 0.02 },
        { x: W, y: H * 0.02 },
        { x: W * 0.82, y: H * 0.2 },
        { x: W * 0.18, y: H * 0.2 },
      ];
    case 'wall':
      return [
        { x: W * 0.18, y: H * 0.12 },
        { x: W * 0.82, y: H * 0.12 },
        { x: W * 0.82, y: H * 0.64 },
        { x: W * 0.18, y: H * 0.64 },
      ];
    default:
      return [
        { x: W * 0.3, y: H * 0.3 },
        { x: W * 0.7, y: H * 0.3 },
        { x: W * 0.7, y: H * 0.7 },
        { x: W * 0.3, y: H * 0.7 },
      ];
  }
}

/** האם נקודה בתוך מלבן מסובב (לבחירת אובייקט בנגיעה). */
export function hitRotatedRect(px: number, py: number, cx: number, cy: number, w: number, h: number, rotDeg: number, pad = 0): boolean {
  const r = (-rotDeg * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  const x = dx * Math.cos(r) - dy * Math.sin(r);
  const y = dx * Math.sin(r) + dy * Math.cos(r);
  return Math.abs(x) <= w / 2 + pad && Math.abs(y) <= h / 2 + pad;
}

export const rotatePt = (x: number, y: number, deg: number): Pt => {
  const r = (deg * Math.PI) / 180;
  return { x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) };
};

/** פיקסלים לס"מ לפי קו ייחוס. */
export const pxPerCm = (ref?: { a: Pt; b: Pt; lengthCm: number }) =>
  ref && ref.lengthCm > 0 ? Math.hypot(ref.a.x - ref.b.x, ref.a.y - ref.b.y) / ref.lengthCm : undefined;
