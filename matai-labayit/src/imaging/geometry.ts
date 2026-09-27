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

/** הופכי של מטריצה 3×3 (סדר שורות). */
export function invert3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C || 1e-12;
  return [
    A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det,
  ];
}

/** מיפוי ממרחב המישור (u,v ∈ 0..1) לתמונה. */
export function planeToImage(quad: Pt[], u: number, v: number): Pt {
  return applyMatrix(rectToQuad(1, 1, quad), u, v);
}

/** מיפוי מהתמונה למרחב המישור (u,v). */
export function imageToPlane(quad: Pt[], p: Pt): Pt {
  return applyMatrix(invert3(rectToQuad(1, 1, quad)), p.x, p.y);
}

/** ארבע הפינות בתמונה של מלבן בתוך מישור. */
export function planeRectCorners(quad: Pt[], r: { u: number; v: number; w: number; h: number }): [Pt, Pt, Pt, Pt] {
  return [
    planeToImage(quad, r.u, r.v),
    planeToImage(quad, r.u + r.w, r.v),
    planeToImage(quad, r.u + r.w, r.v + r.h),
    planeToImage(quad, r.u, r.v + r.h),
  ];
}

/**
 * התאמת מרובע למסכה (קיר/רצפה שזוהו): ארבע נקודות הקיצון לפי x±y –
 * נותן טרפז שמתאים לפרספקטיבה של משטחים ישרים טוב יותר ממלבן חוסם.
 */
export function quadFromMask(mask: { data: Uint8Array; width: number; height: number }, scale = 1): [Pt, Pt, Pt, Pt] | null {
  const { data, width: w, height: h } = mask;
  let tl = { v: Infinity, x: 0, y: 0 };
  let tr = { v: -Infinity, x: 0, y: 0 };
  let br = { v: -Infinity, x: 0, y: 0 };
  let bl = { v: Infinity, x: 0, y: 0 };
  let any = false;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (data[y * w + x] < 128) continue;
      any = true;
      if (x + y < tl.v) tl = { v: x + y, x, y };
      if (x - y > tr.v) tr = { v: x - y, x, y };
      if (x + y > br.v) br = { v: x + y, x, y };
      if (x - y < bl.v) bl = { v: x - y, x, y };
    }
  if (!any) return null;
  const s = 1 / scale;
  return [
    { x: tl.x * s, y: tl.y * s },
    { x: (tr.x + 1) * s, y: tr.y * s },
    { x: (br.x + 1) * s, y: (br.y + 1) * s },
    { x: bl.x * s, y: (bl.y + 1) * s },
  ];
}

/** התאמת קו x = a + b·y לנקודות, עם השמטת חריגים (רהיטים שמסתירים את קו הקיר-רצפה). */
function robustLineX(pts: { x: number; y: number }[]): { a: number; b: number; support: number } | null {
  let use = pts;
  let fit: { a: number; b: number; support: number } | null = null;
  for (let iter = 0; iter < 3; iter++) {
    if (use.length < 6) break;
    let sy = 0, sx = 0, syy = 0, sxy = 0;
    for (const p of use) {
      sy += p.y;
      sx += p.x;
      syy += p.y * p.y;
      sxy += p.x * p.y;
    }
    const n = use.length;
    const d = n * syy - sy * sy;
    if (Math.abs(d) < 1e-6) break;
    const b = (n * sxy - sx * sy) / d;
    fit = { a: (sx - b * sy) / n, b, support: 0 };
    const res = use.map((p) => Math.abs(p.x - (fit!.a + fit!.b * p.y)));
    const med = [...res].sort((p, q) => p - q)[res.length >> 1];
    const lim = Math.max(1.5, med * 2.5);
    use = use.filter((_, i) => res[i] <= lim);
  }
  if (fit && use.length) {
    // תמיכה = טווח השורות שהקו מסביר (קו ארוך ורציף = אמין)
    let y0 = Infinity, y1 = -Infinity;
    for (const p of use) {
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    }
    fit.support = Math.min(use.length, y1 - y0 + 1);
  }
  return fit;
}

/**
 * מרובע פרספקטיבה לרצפה מתוך מסכת רצפה: הקצה הרחוק (קו הקיר האחורי) + שני קווי הקיר-רצפה
 * בצדדים (התאמת קו חסינה), עד תחתית התמונה. הפינות התחתונות יכולות לצאת מחוץ לתמונה –
 * כך המרובע מייצג מלבן אמיתי על הרצפה והדוגמה מקבלת פרספקטיבה נכונה.
 * מחזיר null אם אין מספיק מידע (ואז משתמשים ב-quadFromMask).
 */
export function floorQuadFromMask(mask: { data: Uint8Array; width: number; height: number }, scale = 1): [Pt, Pt, Pt, Pt] | null {
  const { data, width: w, height: h } = mask;
  const xl = new Int32Array(h).fill(-1);
  const xr = new Int32Array(h).fill(-1);
  const cnt = new Int32Array(h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[y * w + x] >= 128) {
        if (xl[y] < 0) xl[y] = x;
        xr[y] = x;
        cnt[y]++;
      }
  let yTop = -1;
  let yBot = -1;
  for (let y = 0; y < h; y++) if (cnt[y] >= w * 0.05) { if (yTop < 0) yTop = y; yBot = y; }
  if (yTop < 0 || yBot - yTop < h * 0.1) return null;
  const left: { x: number; y: number }[] = [];
  const right: { x: number; y: number }[] = [];
  for (let y = yTop + 2; y <= yBot; y++) {
    if (cnt[y] < w * 0.05) continue;
    if (xl[y] > 1) left.push({ x: xl[y], y });
    if (xr[y] < w - 2) right.push({ x: xr[y] + 1, y });
  }
  // הקצה הרחוק (קו הקיר האחורי): התאמת קו y = c + d·x לראש המסכה בכל עמודה – לא בהכרח אופקי (צילום מעט באלכסון).
  // רהיטים שעומדים על הקו (שידה) נפסלים כחריגים.
  const tops: { x: number; y: number }[] = [];
  const band = Math.max(4, (yBot - yTop) * 0.06);
  for (let x = 0; x < w; x++) {
    for (let y = yTop; y <= yTop + band && y <= yBot; y++)
      if (data[y * w + x] >= 128) {
        tops.push({ x: y, y: x }); // מוחלף: robustLineX מתאים x כפונקציה של y
        break;
      }
  }
  const ff = tops.length >= 20 ? robustLineX(tops) : null;
  const far = ff && Math.abs(ff.b) < 0.3 ? { c: ff.a, d: ff.b } : { c: yTop, d: 0 };
  const farY = (x: number) => far.c + far.d * x;
  // נקודת החיתוך של צד (x = a + b·y) עם הקו הרחוק
  const meetFar = (f: { a: number; b: number }): Pt => {
    const x = (f.a + f.b * far.c) / (1 - f.b * far.d || 1e-9);
    return { x, y: farY(x) };
  };
  // קצוות הקצה הרחוק מהמסכה (לשיקוף צד חלש): הרוחב המרבי בשורות הראשונות
  let farL = xl[yTop];
  let farR = xr[yTop] + 1;
  for (let y = yTop; y <= Math.min(yBot, yTop + Math.round(h * 0.03)); y++) {
    if (xl[y] >= 0 && xl[y] > 1) farL = Math.min(farL, xl[y]);
    if (xr[y] >= 0 && xr[y] < w - 2) farR = Math.max(farR, xr[y] + 1);
  }
  let lf = left.length >= 8 ? robustLineX(left) : null;
  let rf = right.length >= 8 ? robustLineX(right) : null;
  // צד אחד חלש (מוסתר ע"י רהיט/צמח או נחתך ע"י שולי התמונה): משקפים אותו דרך נקודת מגוז
  // שמעל מרכז הקצה הרחוק – הנחה סבירה לצילום חזיתי של חדר
  const good = (f: typeof lf, other: typeof lf) => !!f && f.support >= 12 && (!other || f.support >= other.support * 0.6);
  let lGood = good(lf, rf);
  let rGood = good(rf, lf);
  // שני הצדדים "טובים" אבל ההתכנסות לא סבירה (שיפוע שונה מאוד) – סומכים על הצד עם התמיכה הרבה יותר
  if (lGood && rGood && lf && rf && Math.abs(lf.b) > 1e-3 && Math.abs(rf.b) > 1e-3) {
    const ratio = Math.abs(lf.b) / Math.abs(rf.b);
    if (ratio > 3 || ratio < 1 / 3 || Math.sign(lf.b) === Math.sign(rf.b)) {
      if (lf.support >= rf.support) rGood = false;
      else lGood = false;
    }
  }
  /**
   * קו דרך נקודת המגוז (על הקו הטוב, מעל אמצע הקצה הרחוק) ודרך הקצה הרחוק של הצד החלש.
   * הקצה מורחב עד שכל פיקסלי הרצפה במסכה בתוך המרובע (פינה מוסתרת ע"י צמח לא "חותכת" רצפה).
   */
  const mirror = (goodLine: { a: number; b: number }, endX: number, otherEnd: Pt, side: 1 | -1) => {
    let xe = endX;
    for (let pass = 0; pass < 2; pass++) {
      const ye = farY(xe);
      const midX = (xe + otherEnd.x) / 2;
      const yv = Math.abs(goodLine.b) > 1e-3 ? (midX - goodLine.a) / goodLine.b : -Infinity;
      if (!Number.isFinite(yv) || yv >= ye) return { a: xe, b: 0, support: 0 };
      for (let y = yTop; y <= yBot; y++) {
        const edge = side > 0 ? xr[y] + 1 : xl[y];
        if (edge < 0 || y <= yv + 1) continue;
        const need = midX + ((edge - midX) * (ye - yv)) / (y - yv);
        if (side > 0 ? need > xe : need < xe) xe = need;
      }
    }
    const ye = farY(xe);
    const midX = (xe + otherEnd.x) / 2;
    const yv = (midX - goodLine.a) / goodLine.b;
    const b = (xe - midX) / (ye - yv);
    return { a: xe - b * ye, b, support: 0 };
  };
  if (lGood && !rGood) rf = mirror(lf!, farR, meetFar(lf!), 1);
  else if (rGood && !lGood) lf = mirror(rf!, farL, meetFar(rf!), -1);
  else if (!lGood && !rGood) {
    // שני הצדדים בשולי התמונה (צילום כלפי מטה) – אין מידע על ההתכנסות
    lf = { a: xl[yBot], b: 0, support: 0 };
    rf = { a: xr[yBot] + 1, b: 0, support: 0 };
  }
  if (!lf || !rf) return null;
  const yb = yBot + 1;
  const q: [Pt, Pt, Pt, Pt] = [meetFar(lf), meetFar(rf), { x: rf.a + rf.b * yb, y: yb }, { x: lf.a + lf.b * yb, y: yb }];
  // בדיקת שפיות: צורה קמורה, צד רחוק צר מהקרוב, לא מתפוצץ
  if (!(q[0].x < q[1].x && q[3].x < q[2].x) || q[1].x - q[0].x > q[2].x - q[3].x + 2 || q[2].x - q[3].x > w * 8) return null;
  const s = 1 / scale;
  return q.map((p) => ({ x: p.x * s, y: p.y * s })) as [Pt, Pt, Pt, Pt];
}

export const quadCentroid = (q: Pt[]): Pt => ({ x: q.reduce((s, p) => s + p.x, 0) / q.length, y: q.reduce((s, p) => s + p.y, 0) / q.length });
