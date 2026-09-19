import { getSupabase } from './supabase';
import { randomFileName } from './ids';
import { sha256Blob } from './hash';

/**
 * אחסון קבצים פרטי.
 * - שמות הקבצים אקראיים ואינם נגזרים מפרטי לקוח.
 * - המקטע הראשון בנתיב הוא מזהה הארגון, וזה מה ש-RLS של ה-storage בודק.
 * - גישה לקריאה רק דרך signed URL קצר-מועד.
 */

export const STORAGE_BUCKET = 'pest-log-files';

/** גודל מרבי לקובץ שמועלה מהלקוח (15MB, תואם למגבלת ה-bucket). */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ALLOWED_UPLOAD_TYPES = [...ALLOWED_IMAGE_TYPES, 'application/pdf'] as const;

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export interface UploadResult {
  bucket: string;
  path: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
}

export function validateUpload(blob: Blob): { ok: true } | { ok: false; error: string } {
  if (blob.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `הקובץ גדול מדי (${(blob.size / 1024 / 1024).toFixed(1)}MB). הגודל המרבי הוא ${MAX_FILE_BYTES / 1024 / 1024}MB.`,
    };
  }
  if (blob.size === 0) return { ok: false, error: 'הקובץ ריק.' };
  if (!(ALLOWED_UPLOAD_TYPES as readonly string[]).includes(blob.type)) {
    return { ok: false, error: `סוג הקובץ ${blob.type || 'לא ידוע'} אינו נתמך. מותר: JPG, PNG, WEBP, PDF.` };
  }
  return { ok: true };
}

/** העלאת קובץ לאחסון הפרטי. מחזיר את הנתיב ואת טביעת האצבע. */
export async function uploadFile(
  organizationId: string,
  blob: Blob,
  options: { logId?: string; folder?: string } = {},
): Promise<UploadResult> {
  const validation = validateUpload(blob);
  if (!validation.ok) throw new Error(validation.error);

  const extension = EXTENSION_BY_TYPE[blob.type] ?? 'bin';
  const folder = options.folder ?? (options.logId ? `logs/${options.logId}` : 'misc');
  const path = `${organizationId}/${folder}/${randomFileName(extension)}`;

  const { error } = await getSupabase()
    .storage.from(STORAGE_BUCKET)
    .upload(path, blob, { contentType: blob.type, upsert: false, cacheControl: 'private, max-age=0' });

  if (error) throw new Error(`העלאת הקובץ נכשלה: ${error.message}`);

  return {
    bucket: STORAGE_BUCKET,
    path,
    sha256: await sha256Blob(blob),
    sizeBytes: blob.size,
    mimeType: blob.type,
  };
}

/** signed URL קצר-מועד לצפייה/הורדה. */
export async function createSignedUrl(path: string, expiresInSeconds = 300): Promise<string> {
  const { data, error } = await getSupabase()
    .storage.from(STORAGE_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(`יצירת קישור לקובץ נכשלה: ${error?.message ?? 'שגיאה לא ידועה'}`);
  }
  return data.signedUrl;
}

/**
 * דחיסת תמונה מבוקרת לפני העלאה.
 * שומרת על יחס הגובה-רוחב, מקטינה לרוחב מרבי ומורידה איכות עד שהקובץ
 * נכנס לתקציב. לא דוחסת אם התמונה כבר קטנה מהתקציב.
 */
export async function compressImage(
  file: Blob,
  { maxDimension = 2000, targetBytes = 1_200_000, minQuality = 0.5 } = {},
): Promise<Blob> {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) return file;
  if (file.size <= targetBytes) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality = 0.85;
  let output = await canvasToBlob(canvas, 'image/jpeg', quality);
  while (output && output.size > targetBytes && quality > minQuality) {
    quality -= 0.1;
    output = await canvasToBlob(canvas, 'image/jpeg', quality);
  }
  return output && output.size < file.size ? output : file;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** ממיר data URL של חתימה ל-Blob להעלאה. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, payload] = dataUrl.split(',');
  if (!header || !payload) throw new Error('חתימה — נתוני התמונה אינם תקינים.');
  const mimeMatch = header.match(/data:([^;]+)/);
  const mimeType = mimeMatch?.[1] ?? 'image/png';
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}
