// לקוח לשירות העיבוד בענן (אופציונלי). האפליקציה מדברת רק עם השרת שלכם (תיקיית server/),
// ומפתחות ה-API של ספקי ה-AI נשמרים רק בשרת – אף פעם לא בקוד האפליקציה.
// שימוש בשירות דורש: הפעלה בהגדרות + אישור מפורש בכל שליחה של תמונת חדר.
import { getState } from '@/storage/db';
import { readImageBase64 } from '@/storage/imageStore';
import type { ImageRef } from '@/model/types';

export type CloudCapabilities = { removeBackground: boolean; segmentSurface: boolean; mock?: boolean };

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

/** הסרת רקע בענן – שולח רק את תמונת המוצר. מחזיר PNG שקוף (base64). */
export async function removeBackgroundCloud(photo: ImageRef): Promise<string> {
  const image = await readImageBase64(photo);
  const r = await call<{ image: string }>('/v1/remove-background', { image, mime: 'image/jpeg' });
  return r.image;
}

/** זיהוי משטח בענן – שולח את תמונת החדר ונקודה. מחזיר מסכה (PNG, base64). */
export async function segmentSurfaceCloud(photo: ImageRef, point: { x: number; y: number }, target: string): Promise<string> {
  const image = await readImageBase64(photo);
  const r = await call<{ mask: string }>('/v1/segment-surface', { image, mime: 'image/jpeg', point, target });
  return r.mask;
}
