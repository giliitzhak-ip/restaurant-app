/**
 * טביעות אצבע.
 *
 * חשוב: ה-hash הקובע של המסמך הסופי מחושב בצד השרת (app.document_hash
 * ב-Postgres) ונשמר ב-pest_logs.document_hash. הפונקציות כאן משמשות
 * שלמות מקומית — זיהוי שינוי בטיוטה וטביעת אצבע לקבצים — ולא מתיימרות
 * לשחזר את ה-hash של המסמך.
 */

/** JSON קנוני: מפתחות ממוינים, בלי רווחים. */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 של מחרוזת. */
export async function sha256Text(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
}

/** SHA-256 של קובץ/Blob. */
export async function sha256Blob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return toHex(digest);
}

/** טביעת אצבע מקומית של תוכן טיוטה, לזיהוי שינוי אמיתי לפני שמירה. */
export async function contentFingerprint(content: unknown): Promise<string> {
  return sha256Text(canonicalJson(content));
}
