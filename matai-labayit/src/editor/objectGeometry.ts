// גאומטריה של אובייקט בהדמיה: כל אובייקט מיוצג בסוף כארבע פינות על תמונת החדר
// (הומוגרפיה של תמונת המוצר) – בין אם הוא ממוקם חופשי (מרכז/גודל/סיבוב/הטיה),
// בפרספקטיבה חופשית (4 פינות), או מוצמד למישור קיר/רצפה.
// אותו חישוב משמש לציור, לבחירה בנגיעה, לידיות ולצללים.
import { planeRectCorners } from '@/imaging/geometry';
import type { ObjectLayer, Plane, Pt, Quad } from '@/model/types';

const rad = (d: number) => (d * Math.PI) / 180;

/** פינות התמונה (TL, TR, BR, BL של תמונת המוצר) בקואורדינטות החדר. */
export function objectCorners(l: ObjectLayer, aspect: number, planes?: Plane[]): Quad {
  if (l.planeId && l.planeRect) {
    const plane = planes?.find((p) => p.id === l.planeId);
    if (plane) {
      const c = planeRectCorners(plane.quad, l.planeRect);
      return l.flipX ? [c[1], c[0], c[3], c[2]] : c;
    }
  }
  if (l.corners) return l.flipX ? [l.corners[1], l.corners[0], l.corners[3], l.corners[2]] : l.corners;
  const w = l.width;
  const h = l.width * aspect;
  const d = Math.max(w, h) * 2.5; // מרחק פרספקטיבה
  const f = l.flipX ? -1 : 1;
  const cz = Math.cos(rad(l.rotation));
  const sz = Math.sin(rad(l.rotation));
  const cy = Math.cos(rad(l.tiltY));
  const sy = Math.sin(rad(l.tiltY));
  const cx = Math.cos(rad(l.tiltX));
  const sx = Math.sin(rad(l.tiltX));
  const proj = (px: number, py: number): Pt => {
    // היפוך ← סיבוב במישור ← סיבוב סביב ציר אנכי ← הטיה קדימה/אחורה ← פרספקטיבה
    let x = px * f;
    let y = py;
    let z = 0;
    [x, y] = [x * cz - y * sz, x * sz + y * cz];
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    [y, z] = [y * cx - z * sx, y * sx + z * cx];
    const k = d / (d - z);
    return { x: l.x + x * k, y: l.y + y * k };
  };
  return [proj(-w / 2, -h / 2), proj(w / 2, -h / 2), proj(w / 2, h / 2), proj(-w / 2, h / 2)];
}

export const edgeLen = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** הנקודה הנמוכה ביותר של האובייקט בתמונה (משמשת לסדר עומק מול חפצים קיימים). */
export const objectBottomY = (q: Quad) => Math.max(q[2].y, q[3].y);

/** רוחב תצוגה בפיקסלים של החדר (אורך הצלע התחתונה). */
export const objectDisplayWidth = (q: Quad) => (edgeLen(q[0], q[1]) + edgeLen(q[3], q[2])) / 2;

/**
 * מרובע הצל המוקרן על הרצפה: הצלע התחתונה נשארת, והצללית "נופלת" אחורה/הצידה
 * בזווית ובאורך נתונים, מכווצת בפרספקטיבה (רצפה נראית משוטחת בצילום).
 */
export function castShadowQuad(q: Quad, angleDeg: number, length: number): Quad {
  const b0 = q[3];
  const b1 = q[2];
  const hx = ((q[0].x - q[3].x) + (q[1].x - q[2].x)) / 2;
  const hy = ((q[0].y - q[3].y) + (q[1].y - q[2].y)) / 2;
  const hLen = Math.hypot(hx, hy);
  const a = rad(angleDeg);
  // כיוון הבסיס: "למעלה" בתמונה (אחורה בחדר), מסובב בזווית הצל
  const dx = Math.sin(a) * hLen * length;
  const dy = -Math.cos(a) * hLen * length * 0.35;
  return [
    { x: b0.x + dx, y: b0.y + dy },
    { x: b1.x + dx, y: b1.y + dy },
    { x: b1.x, y: b1.y },
    { x: b0.x, y: b0.y },
  ];
}
