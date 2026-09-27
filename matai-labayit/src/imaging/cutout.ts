// אלגוריתמים מקומיים (ללא שירות חיצוני) להסרת רקע, בחירת אזור לפי צבע ומברשת תיקון.
// עובדים על תמונה מוקטנת (עד ~800 פיקסלים) כדי לרוץ מהר גם בטלפון.
import type { Pixels } from './skiaImage';

export type Rect = { x: number; y: number; w: number; h: number };
export type Mask = { data: Uint8Array; width: number; height: number };

// ---------- צבע במרחב Lab (הבדלי צבע קרובים לתפיסה האנושית) ----------
const lin = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  lin[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

export function toLab(px: Pixels): Float32Array {
  const n = px.width * px.height;
  const out = new Float32Array(n * 3);
  const d = px.data;
  for (let i = 0; i < n; i++) {
    const r = lin[d[i * 4]];
    const g = lin[d[i * 4 + 1]];
    const b = lin[d[i * 4 + 2]];
    const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
    const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
    const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
    out[i * 3] = 116 * y - 16;
    out[i * 3 + 1] = 500 * (x - y);
    out[i * 3 + 2] = 200 * (y - z);
  }
  return out;
}

const dist = (lab: Float32Array, i: number, c: number[] | Float32Array, j = 0) => {
  const dl = lab[i * 3] - c[j];
  const da = lab[i * 3 + 1] - c[j + 1];
  const db = lab[i * 3 + 2] - c[j + 2];
  return Math.sqrt(dl * dl * 0.6 + da * da + db * db);
};

function kmeans(lab: Float32Array, idx: number[], k: number, iters = 6): number[] {
  const centers: number[] = [];
  if (!idx.length) return centers;
  for (let c = 0; c < k; c++) {
    const i = idx[Math.floor(((c + 0.5) / k) * idx.length)];
    centers.push(lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]);
  }
  for (let it = 0; it < iters; it++) {
    const sum = new Float64Array(k * 3);
    const cnt = new Uint32Array(k);
    for (const i of idx) {
      let best = 0;
      let bd = Infinity;
      for (let c = 0; c < k; c++) {
        const dd = dist(lab, i, centers, c * 3);
        if (dd < bd) {
          bd = dd;
          best = c;
        }
      }
      sum[best * 3] += lab[i * 3];
      sum[best * 3 + 1] += lab[i * 3 + 1];
      sum[best * 3 + 2] += lab[i * 3 + 2];
      cnt[best]++;
    }
    for (let c = 0; c < k; c++) {
      if (cnt[c]) {
        centers[c * 3] = sum[c * 3] / cnt[c];
        centers[c * 3 + 1] = sum[c * 3 + 1] / cnt[c];
        centers[c * 3 + 2] = sum[c * 3 + 2] / cnt[c];
      }
    }
  }
  return centers;
}

// ---------- פעולות מורפולוגיות ----------
function erode(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return morph(m, w, h, r, true);
}
function dilate(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return morph(m, w, h, r, false);
}
function morph(m: Uint8Array, w: number, h: number, r: number, isErode: boolean): Uint8Array {
  // שני מעברים נפרדים (אופקי ואנכי) של מינימום/מקסימום
  const tmp = new Uint8Array(m.length);
  const out = new Uint8Array(m.length);
  const pick = isErode ? Math.min : Math.max;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = m[y * w + x];
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < w) v = pick(v, m[y * w + xx]);
      }
      tmp[y * w + x] = v;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = tmp[y * w + x];
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < h) v = pick(v, tmp[yy * w + x]);
      }
      out[y * w + x] = v;
    }
  return out;
}

function blur(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return m;
  const tmp = new Float32Array(m.length);
  const out = new Uint8Array(m.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < w) {
          s += m[y * w + xx];
          n++;
        }
      }
      tmp[y * w + x] = s / n;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < h) {
          s += tmp[yy * w + x];
          n++;
        }
      }
      out[y * w + x] = Math.round(s / n);
    }
  return out;
}

/** השארת הרכיב הקשיר הגדול ביותר (ורכיבים גדולים נוספים). */
function keepMainComponents(m: Uint8Array, w: number, h: number, minRatio = 0.08): Uint8Array {
  const label = new Int32Array(m.length).fill(-1);
  const sizes: number[] = [];
  const stack = new Int32Array(m.length);
  for (let i = 0; i < m.length; i++) {
    if (m[i] < 128 || label[i] !== -1) continue;
    const id = sizes.length;
    let sp = 0;
    stack[sp++] = i;
    label[i] = id;
    let size = 0;
    while (sp) {
      const p = stack[--sp];
      size++;
      const x = p % w;
      const y = (p - x) / w;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of nb) {
        if (q >= 0 && m[q] >= 128 && label[q] === -1) {
          label[q] = id;
          stack[sp++] = q;
        }
      }
    }
    sizes.push(size);
  }
  if (!sizes.length) return m;
  const max = Math.max(...sizes);
  const out = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) if (label[i] >= 0 && sizes[label[i]] >= max * minRatio) out[i] = 255;
  return out;
}

/**
 * הסרת רקע אוטומטית בתוך מלבן בחירה:
 * 1. דוגמים את צבעי הרקע משולי המלבן (אשכולות k-means).
 * 2. "מציפים" מהשוליים פנימה כל עוד הצבע דומה לרקע ואין קצה חד.
 * 3. מה שלא הוצף – המוצר. מנקים רעש, משאירים את האובייקט העיקרי ומרככים קצוות.
 */
export function autoMask(px: Pixels, sel: Rect, tolerance = 0.5, keepLargest = true): Mask {
  const { width: w, height: h } = px;
  const x0 = Math.max(0, Math.floor(sel.x));
  const y0 = Math.max(0, Math.floor(sel.y));
  const x1 = Math.min(w - 1, Math.ceil(sel.x + sel.w));
  const y1 = Math.min(h - 1, Math.ceil(sel.y + sel.h));
  const lab = toLab(px);
  const ring: number[] = [];
  const t = Math.max(2, Math.round(Math.min(x1 - x0, y1 - y0) * 0.02));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (x - x0 < t || x1 - x < t || y - y0 < t || y1 - y < t) ring.push(y * w + x);
    }
  const step = Math.max(1, Math.floor(ring.length / 4000));
  const sample = ring.filter((_, i) => i % step === 0);
  const centers = kmeans(lab, sample, 6);
  const K = centers.length / 3;
  // מודל צבעי המוצר: דגימה מהחלק המרכזי של הבחירה
  const inner: number[] = [];
  const cx0 = x0 + (x1 - x0) * 0.25;
  const cx1 = x0 + (x1 - x0) * 0.75;
  const cy0 = y0 + (y1 - y0) * 0.25;
  const cy1 = y0 + (y1 - y0) * 0.75;
  const istep = Math.max(1, Math.floor(Math.sqrt(((cx1 - cx0) * (cy1 - cy0)) / 4000)));
  for (let y = Math.floor(cy0); y < cy1; y += istep) for (let x = Math.floor(cx0); x < cx1; x += istep) inner.push(y * w + x);
  const fgCenters = kmeans(lab, inner, 6);
  const KF = fgCenters.length / 3;

  const T = 6 + tolerance * 28; // סף דמיון לרקע
  const TE = 4 + tolerance * 14; // סף קצה בין שכנים
  const bgDist = new Float32Array(w * h);
  const bgLike = new Uint8Array(w * h); // 2 = רקע ודאי, 1 = יותר דומה לרקע מאשר למוצר
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      let bd = Infinity;
      for (let c = 0; c < K; c++) bd = Math.min(bd, dist(lab, i, centers, c * 3));
      let fd = Infinity;
      for (let c = 0; c < KF; c++) fd = Math.min(fd, dist(lab, i, fgCenters, c * 3));
      bgDist[i] = bd;
      if (bd < T * 0.3) bgLike[i] = 2;
      else if (bd < T && bd < fd * 0.85) bgLike[i] = 1;
    }

  const bg = new Uint8Array(w * h);
  // מחוץ לבחירה – רקע
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < x0 || x > x1 || y < y0 || y > y1) bg[y * w + x] = 1;
  const queue = new Int32Array(w * h);
  let qh = 0;
  let qt = 0;
  for (const i of ring) {
    if (bgLike[i] && !bg[i]) {
      bg[i] = 1;
      queue[qt++] = i;
    }
  }
  while (qh < qt) {
    const p = queue[qh++];
    const x = p % w;
    const y = (p - x) / w;
    const nb = [x > x0 ? p - 1 : -1, x < x1 ? p + 1 : -1, y > y0 ? p - w : -1, y < y1 ? p + w : -1];
    for (const q of nb) {
      if (q < 0 || bg[q]) continue;
      const bl = bgLike[q];
      if (bl === 2 || (bl === 1 && dist(lab, q, lab, p * 3) < TE)) {
        bg[q] = 1;
        queue[qt++] = q;
      }
    }
  }
  let m: Uint8Array = new Uint8Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = bg[i] ? 0 : 255;
  m = dilate(erode(m, w, h, 1), w, h, 1); // פתיחה – הסרת רעש דק
  if (keepLargest) m = keepMainComponents(m, w, h);
  m = blur(m, w, h, 1);
  return { data: m, width: w, height: h };
}

/** מסכה מלאה בתוך מלבן (לתמונת מוצר נקייה/שימוש כמו שהיא). */
export function rectMask(w: number, h: number, sel: Rect): Mask {
  const m = new Uint8Array(w * h);
  for (let y = Math.max(0, Math.floor(sel.y)); y < Math.min(h, sel.y + sel.h); y++)
    for (let x = Math.max(0, Math.floor(sel.x)); x < Math.min(w, sel.x + sel.w); x++) m[y * w + x] = 255;
  return { data: m, width: w, height: h };
}

/** ציור קו מברשת רכה במסכה (value=255 משחזר, 0 מוחק). */
export function stampStroke(mask: Mask, points: number[], radius: number, value: 0 | 255) {
  const { data, width: w, height: h } = mask;
  const stamp = (cx: number, cy: number) => {
    const r = radius;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d > r) continue;
        const a = d < r - 1.5 ? 1 : (r - d) / 1.5; // קצה רך
        const i = y * w + x;
        data[i] = Math.round(data[i] + (value - data[i]) * a);
      }
  };
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    if (i >= 2) {
      const px = points[i - 2];
      const py = points[i - 1];
      const steps = Math.ceil(Math.hypot(x - px, y - py) / Math.max(1, radius / 3));
      for (let s = 1; s <= steps; s++) stamp(px + ((x - px) * s) / steps, py + ((y - py) * s) / steps);
    } else stamp(x, y);
  }
}

export function applyMask(px: Pixels, mask: Mask): Pixels {
  const out = new Uint8Array(px.data);
  for (let i = 0; i < mask.data.length; i++) out[i * 4 + 3] = Math.min(px.data[i * 4 + 3], mask.data[i]);
  return { data: out, width: px.width, height: px.height };
}

export function maskToPixels(mask: Mask, rgb: [number, number, number] = [255, 255, 255]): Pixels {
  const out = new Uint8Array(mask.data.length * 4);
  for (let i = 0; i < mask.data.length; i++) {
    out[i * 4] = rgb[0];
    out[i * 4 + 1] = rgb[1];
    out[i * 4 + 2] = rgb[2];
    out[i * 4 + 3] = mask.data[i];
  }
  return { data: out, width: mask.width, height: mask.height };
}

export function alphaToMask(px: Pixels): Mask {
  const m = new Uint8Array(px.width * px.height);
  for (let i = 0; i < m.length; i++) m[i] = px.data[i * 4 + 3];
  return { data: m, width: px.width, height: px.height };
}

export function maskBounds(mask: Mask, threshold = 20): Rect | null {
  const { data, width: w, height: h } = mask;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[y * w + x] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export const maskCoverage = (mask: Mask) => {
  let s = 0;
  for (let i = 0; i < mask.data.length; i++) s += mask.data[i];
  return s / (255 * mask.data.length);
};

/**
 * בחירת משטח לפי צבע ("שרביט קסמים"): מתחילים מהנקודה שנגעו בה ומתפשטים
 * לפיקסלים בצבע דומה. חפצים על הקיר (תמונות, רהיטים) נשארים מחוץ לאזור.
 */
export function regionGrow(px: Pixels, seedX: number, seedY: number, tolerance = 0.5): { mask: Mask; baseLuma: number; bounds: Rect | null } {
  const { width: w, height: h } = px;
  const lab = toLab(px);
  const sx = Math.max(0, Math.min(w - 1, Math.round(seedX)));
  const sy = Math.max(0, Math.min(h - 1, Math.round(seedY)));
  // צבע הזרע – ממוצע בסביבה קטנה
  const seed = [0, 0, 0];
  let n = 0;
  for (let y = Math.max(0, sy - 2); y <= Math.min(h - 1, sy + 2); y++)
    for (let x = Math.max(0, sx - 2); x <= Math.min(w - 1, sx + 2); x++) {
      const i = y * w + x;
      seed[0] += lab[i * 3];
      seed[1] += lab[i * 3 + 1];
      seed[2] += lab[i * 3 + 2];
      n++;
    }
  seed[0] /= n;
  seed[1] /= n;
  seed[2] /= n;
  // בהירות פחות חשובה (צללים על הקיר), גוון חשוב יותר
  const T = 5 + tolerance * 22;
  const TE = 2 + tolerance * 7;
  const inReg = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let qh = 0;
  let qt = 0;
  const start = sy * w + sx;
  inReg[start] = 1;
  queue[qt++] = start;
  const seedDist = (i: number) => {
    const dl = (lab[i * 3] - seed[0]) * 0.45;
    const da = lab[i * 3 + 1] - seed[1];
    const db = lab[i * 3 + 2] - seed[2];
    return Math.sqrt(dl * dl + da * da + db * db);
  };
  while (qh < qt) {
    const p = queue[qh++];
    const x = p % w;
    const y = (p - x) / w;
    const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
    for (const q of nb) {
      if (q < 0 || inReg[q]) continue;
      if (seedDist(q) < T && dist(lab, q, lab, p * 3) < TE) {
        inReg[q] = 1;
        queue[qt++] = q;
      }
    }
  }
  let m: Uint8Array = new Uint8Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = inReg[i] ? 255 : 0;
  // סגירה – מילוי חורים קטנים של מרקם/רעש
  m = erode(dilate(m, w, h, 2), w, h, 2);
  m = blur(m, w, h, 1);
  const mask = { data: m, width: w, height: h };
  let lsum = 0;
  let lcnt = 0;
  for (let i = 0; i < m.length; i++)
    if (m[i] > 128) {
      lsum += 0.299 * px.data[i * 4] + 0.587 * px.data[i * 4 + 1] + 0.114 * px.data[i * 4 + 2];
      lcnt++;
    }
  return { mask, baseLuma: lcnt ? lsum / lcnt / 255 : 0.7, bounds: maskBounds(mask, 128) };
}

/** בהירות ממוצעת בתוך מצולע (לשמירת צללים כשאין מסכה). */
export function lumaInQuad(px: Pixels, quad: { x: number; y: number }[]): number {
  const { width: w, height: h } = px;
  let s = 0;
  let n = 0;
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 20000)));
  for (let y = 0; y < h; y += step)
    for (let x = 0; x < w; x += step) {
      if (!pointInPoly(x, y, quad)) continue;
      const i = (y * w + x) * 4;
      s += 0.299 * px.data[i] + 0.587 * px.data[i + 1] + 0.114 * px.data[i + 2];
      n++;
    }
  return n ? s / n / 255 : 0.7;
}

export function pointInPoly(x: number, y: number, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
