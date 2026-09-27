// בדיקת איכות תמונה לפני עיבוד: מזהה בעיות נפוצות ומציע איך לצלם טוב יותר.
// הבדיקה מייעצת בלבד – תמיד אפשר להמשיך ולעבוד ידנית.
import type { ImageRef } from '@/model/types';
import { loadSkImage, readPixels, type Pixels } from './skiaImage';

export type QualityIssue = { code: string; severity: 'info' | 'warn'; message: string; tip: string };

function stats(px: Pixels) {
  const { data, width: w, height: h } = px;
  const n = w * h;
  const L = new Float32Array(n);
  let sum = 0;
  let clipped = 0;
  let dark = 0;
  for (let i = 0; i < n; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    L[i] = l;
    sum += l;
    if (r > 248 && g > 248 && b > 248) clipped++;
    if (l < 0.06) dark++;
  }
  // חדות: שונות של לפלסיאן על הבהירות
  let lap = 0;
  let lapSq = 0;
  let m = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = 4 * L[i] - L[i - 1] - L[i + 1] - L[i - w] - L[i + w];
      lap += v;
      lapSq += v * v;
      m++;
    }
  const lapVar = lapSq / m - (lap / m) ** 2;
  return { mean: sum / n, clipped: clipped / n, dark: dark / n, sharpness: lapVar * 1e4 };
}

/** ניתוח תמונה לפי סוגה: חדר, מוצר או דוגמת חומר (אריח/פרקט/חיפוי). */
export async function analyzePhoto(ref: ImageRef, kind: 'room' | 'product' | 'swatch', size?: { w: number; h: number }): Promise<QualityIssue[]> {
  const img = await loadSkImage(ref);
  const px = readPixels(img, 480);
  const s = stats(px);
  const issues: QualityIssue[] = [];
  const W = size?.w ?? img.width();
  const H = size?.h ?? img.height();
  if (Math.min(W, H) < 700) {
    issues.push({ code: 'lowres', severity: 'warn', message: 'רזולוציה נמוכה', tip: 'צלמו מחדש במצלמה (לא צילום מסך או תמונה מוקטנת מרשת חברתית).' });
  }
  if (s.mean < 0.2) {
    issues.push({ code: 'dark', severity: 'warn', message: 'התמונה חשוכה מאוד', tip: 'הדליקו אור או התקרבו לחלון. אל תשתמשו בפלאש – הוא משטיח צבעים.' });
  } else if (s.mean > 0.86) {
    issues.push({ code: 'bright', severity: 'warn', message: 'התמונה בהירה מדי (שרופה)', tip: 'הקישו על המוצר במסך המצלמה כדי לכוון חשיפה, או התרחקו ממקור אור ישיר.' });
  }
  if (kind !== 'room' && s.clipped > 0.04 && s.mean < 0.86) {
    issues.push({ code: 'glare', severity: 'warn', message: 'השתקפויות או ברק חזק', tip: 'זוזו מעט הצידה כך שהזרקורים לא ישתקפו במוצר. משטחים מבריקים – צלמו בזווית קלה.' });
  }
  if (s.sharpness < (kind === 'room' ? 1.2 : 2.0)) {
    issues.push({ code: 'blur', severity: 'warn', message: 'התמונה נראית מטושטשת', tip: 'החזיקו את הטלפון יציב והקישו על המוצר למיקוד לפני הצילום.' });
  }
  if (kind === 'room' && W < H) {
    issues.push({ code: 'portrait', severity: 'info', message: 'צילום לאורך', tip: 'לחדרים, צילום לרוחב מכניס יותר קיר ורצפה ועוזר למקם מוצרים גדולים.' });
  }
  if (kind === 'swatch' && Math.max(W, H) / Math.min(W, H) > 2.2) {
    issues.push({ code: 'narrow', severity: 'info', message: 'דוגמה צרה', tip: 'צלמו אזור גדול יותר מהדוגמה, ישר מלפנים, כך שכמה אריחים/לוחות ייכנסו.' });
  }
  return issues;
}

/** בעיות שמתגלות רק אחרי חיתוך המוצר (למשל מוצר שנחתך בשולי התמונה). */
export function analyzeCutout(mask: { data: Uint8Array; width: number; height: number }): QualityIssue[] {
  const { data, width: w, height: h } = mask;
  let cov = 0;
  let edge = 0;
  let edgeN = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = data[y * w + x] > 127;
      if (v) cov++;
      if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) {
        edgeN++;
        if (v) edge++;
      }
    }
  const c = cov / (w * h);
  const issues: QualityIssue[] = [];
  if (edge / edgeN > 0.08) {
    issues.push({ code: 'cut', severity: 'warn', message: 'המוצר נחתך בשולי התמונה', tip: 'התרחקו צעד אחורה כך שכל המוצר ייכנס עם מעט רווח מסביב. חלקים שלא צולמו לא יוצגו.' });
  }
  if (c < 0.02) issues.push({ code: 'tiny', severity: 'warn', message: 'לא זוהה מוצר ברור', tip: 'התקרבו למוצר, או סמנו מלבן צמוד יותר סביבו.' });
  if (c > 0.85) issues.push({ code: 'nobg', severity: 'info', message: 'כמעט לא הוסר רקע', tip: 'אם הרקע דומה בצבעו למוצר – נסו רגישות גבוהה יותר, מברשת מחיקה, או עיבוד בשרת.' });
  return issues;
}
