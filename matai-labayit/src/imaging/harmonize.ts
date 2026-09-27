// התאמת מראה המוצר לתמונת החדר – בלי לפגוע בזהות המוצר.
//
// העיקרון: לא מתאימים את צבע *המוצר* לצבע *החדר* (ספה ירוקה צריכה להישאר ירוקה),
// אלא את *התאורה*: משווים את הסצנה של צילום החנות לסביבה בחדר שבה המוצר מוצב
// (חשיפה ואיזון לבן לפי "עולם אפור", ניגודיות, חדות ורעש חיישן), ומחילים את ההפרש.
import type { Pt, SceneStats } from '@/model/types';
import type { Pixels } from './skiaImage';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** מאפייני צילום באזור (או בכל התמונה). mask אופציונלי – פיקסלים לא-אפסיים בלבד. */
export function sceneStats(px: Pixels, region?: { x: number; y: number; w: number; h: number }, exclude?: (x: number, y: number) => boolean): SceneStats {
  const { data, width: w, height: h } = px;
  const x0 = Math.max(1, Math.floor(region?.x ?? 0));
  const y0 = Math.max(1, Math.floor(region?.y ?? 0));
  const x1 = Math.min(w - 1, Math.ceil(region ? region.x + region.w : w));
  const y1 = Math.min(h - 1, Math.ceil(region ? region.y + region.h : h));
  const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 60000)));
  let n = 0;
  const sum = [0, 0, 0];
  let sumL = 0;
  let sumL2 = 0;
  let lapSq = 0;
  let lapN = 0;
  const flatRes: number[] = [];
  const L = (i: number) => 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  for (let y = y0; y < y1; y += step)
    for (let x = x0; x < x1; x += step) {
      if (exclude?.(x, y)) continue;
      const i = y * w + x;
      sum[0] += data[i * 4];
      sum[1] += data[i * 4 + 1];
      sum[2] += data[i * 4 + 2];
      const l = L(i);
      sumL += l;
      sumL2 += l * l;
      n++;
      const lap = 4 * l - L(i - 1) - L(i + 1) - L(i - w) - L(i + w);
      lapSq += lap * lap;
      lapN++;
      // רעש: שארית מול ממוצע 3×3 באזורים חלקים בלבד (בלי קצוות)
      const grad = Math.abs(L(i + 1) - L(i - 1)) + Math.abs(L(i + w) - L(i - w));
      if (grad < 12) flatRes.push(l - (L(i - 1) + L(i + 1) + L(i - w) + L(i + w)) / 4);
    }
  if (!n) return { mean: [128, 128, 128], std: 50, sharpness: 50, noise: 2 };
  const mL = sumL / n;
  flatRes.sort((a, b) => Math.abs(a) - Math.abs(b));
  const med = flatRes.length ? Math.abs(flatRes[Math.floor(flatRes.length / 2)]) : 1;
  return {
    mean: [sum[0] / n, sum[1] / n, sum[2] / n],
    std: Math.sqrt(Math.max(1, sumL2 / n - mL * mL)),
    sharpness: Math.sqrt(lapSq / Math.max(1, lapN)),
    noise: med * 1.4826, // הערכת סטיית תקן חסינה (MAD)
  };
}

/**
 * ההתאמה המלאה (harmonize=1) מצילום החנות לסביבה בחדר.
 * @param scale יחס ההקטנה של המוצר כשהוא מוצב (פיקסלים בחדר / פיקסלים בצילום) – משפיע על החדות.
 */
export function computeMatch(store: SceneStats, room: SceneStats, scale: number) {
  const lum = (m: number[]) => 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2];
  const exposure = clamp(lum(room.mean) / Math.max(1, lum(store.mean)), 0.55, 1.8);
  // איזון לבן: יחס הצבע היחסי (מנורמל לבהירות) בין שתי הסצנות
  const chroma = (m: number[]) => m.map((c) => c / Math.max(1, lum(m)));
  const cr = chroma(room.mean);
  const cs = chroma(store.mean);
  const gains = [0, 1, 2].map((c) => clamp(exposure * (cr[c] / Math.max(0.05, cs[c])), 0.5, 2)) as [number, number, number];
  const contrast = clamp(room.std / Math.max(1, store.std), 0.7, 1.3);
  // מוצר מוקטן נראה חד יותר מהחדר – מטשטשים מעט כדי להשוות לחדות הסביבה
  const storeSharpAtScale = store.sharpness * clamp(1 / Math.max(0.05, scale), 1, 4) ** 0.5;
  const blur = clamp((storeSharpAtScale / Math.max(1, room.sharpness) - 1) * 0.6, 0, 1.6);
  const grain = clamp(room.noise - store.noise * scale, 0, 14) / 255;
  return { gains, contrast, blur, grain };
}

/** מטריצת צבע: התאמות המשתמש + ההתאמה לחדר לפי harmonize (0..1). */
export function objectColorMatrix(o: { brightness: number; contrast: number; warmth: number; harmonize?: number; match?: { gains: number[]; contrast: number } }): number[] {
  const h = clamp(o.harmonize ?? 0.35, 0, 1);
  const g = o.match ? o.match.gains.map((v) => Math.pow(v, h)) : [1, 1, 1];
  const k = (1 + o.contrast * 0.6) * (o.match ? Math.pow(o.match.contrast, h) : 1);
  const t = (1 - k) / 2 + o.brightness * 0.22;
  const w = o.warmth;
  return [
    k * g[0], 0, 0, 0, t + w * 0.07,
    0, k * g[1], 0, 0, t + w * 0.02,
    0, 0, k * g[2], 0, t - w * 0.08,
    0, 0, 0, 1, 0,
  ];
}

/** אזור הסביבה של מוצר בחדר (להערכת התאורה המקומית). */
export function neighborhood(center: Pt, w: number, h: number, W: number, H: number) {
  const rw = w * 1.8;
  const rh = h * 1.6;
  const x = clamp(center.x - rw / 2, 0, W - 1);
  const y = clamp(center.y - rh / 2, 0, H - 1);
  return { x, y, w: Math.min(rw, W - x), h: Math.min(rh, H - y) };
}
