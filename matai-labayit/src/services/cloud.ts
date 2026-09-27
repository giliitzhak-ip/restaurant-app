// לקוח לשירות העיבוד בענן (אופציונלי). האפליקציה מדברת רק עם השרת שלכם (תיקיית server/),
// ומפתחות ה-API של ספקי ה-AI נשמרים רק בשרת – אף פעם לא בקוד האפליקציה.
// שימוש בשירות דורש: הפעלה בהגדרות + אישור מפורש בכל שליחה של תמונת חדר.
import { getState } from '@/storage/db';
import { readImageBase64 } from '@/storage/imageStore';
import type { ImageRef } from '@/model/types';

export type CloudCapabilities = {
  removeBackground: boolean;
  segmentSurface: boolean;
  segment?: boolean;
  depth?: boolean;
  harmonize?: boolean;
  models?: { sam: boolean; isnet: boolean; midas: boolean };
  mock?: boolean;
};

export class CloudError extends Error {}

export const cloudConfigured = () => {
  const c = getState().settings.cloud;
  return c.enabled && !!c.serverUrl && !!c.consentAt;
};

const base = () => getState().settings.cloud.serverUrl.replace(/\/+$/, '');

async function call<T>(path: string, body?: unknown, timeoutMs = 45000, url = base()): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url + path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 501) throw new CloudError(json.error ?? 'השירות לא הוגדר בשרת (חסר מפתח API).');
      throw new CloudError(json.error ?? `השרת החזיר שגיאה (${res.status}).`);
    }
    return json as T;
  } catch (e) {
    if (e instanceof CloudError) throw e;
    if ((e as Error).name === 'AbortError') throw new CloudError('השרת לא הגיב בזמן. אפשר להמשיך בעיבוד מקומי.');
    throw new CloudError('אין חיבור לשרת העיבוד. בדקו את הכתובת בהגדרות או המשיכו בעיבוד מקומי.');
  } finally {
    clearTimeout(t);
  }
}

export async function checkServer(url: string): Promise<CloudCapabilities> {
  const r = await call<{ ok: boolean; capabilities: CloudCapabilities }>('/v1/health', undefined, 8000, url.replace(/\/+$/, ''));
  return r.capabilities;
}

let caps: CloudCapabilities | null = null;
/** יכולות השרת (נשמר בזיכרון אחרי בדיקה ראשונה). */
export async function serverCapabilities(): Promise<CloudCapabilities | null> {
  if (!cloudConfigured()) return null;
  if (caps) return caps;
  try {
    caps = await checkServer(base());
  } catch {
    caps = null;
  }
  return caps;
}
export const resetCapabilities = () => (caps = null);

type NBox = { x: number; y: number; w: number; h: number };

/**
 * הסרת רקע בשרת – שולח רק את תמונת המוצר. box (מנורמל 0..1) = המלבן שסימן המשתמש;
 * בשרת עם מודלים מקומיים: SAM בוחר את האובייקט ו-ISNet מעדן שוליים. מחזיר PNG שקוף (base64).
 */
export async function removeBackgroundCloud(photo: ImageRef, box?: NBox): Promise<{ image: string; method?: string }> {
  const image = await readImageBase64(photo);
  return call<{ image: string; method?: string }>('/v1/remove-background', { image, mime: 'image/jpeg', box }, 90000);
}

/** בחירה בנגיעה (SAM): נקודות מנורמלות, label 1 = כלול, 0 = לא כלול. מחזיר מסכה (PNG אלפא). */
export async function segmentCloud(photo: ImageRef, points: { x: number; y: number; label: number }[], box?: NBox): Promise<{ mask: string; score?: number }> {
  const image = await readImageBase64(photo);
  return call<{ mask: string; score?: number }>('/v1/segment', { image, mime: 'image/jpeg', points, box }, 90000);
}

/**
 * השתלבות בעזרת מודל יצירת תמונה (אם חובר בשרת). protect = מסכת המוצרים – השרת מחזיר
 * את פיקסלי המוצר המקוריים אחרי העיבוד, כך שהדגם לא יכול להשתנות. strength מוגבל בשרת ל-0.6.
 */
export async function harmonizeCloud(imageJpeg: string, protectPng: string, strength: number): Promise<string> {
  const r = await call<{ image: string }>('/v1/harmonize', { image: imageJpeg, protect: protectPng, strength }, 120000);
  return r.image;
}
