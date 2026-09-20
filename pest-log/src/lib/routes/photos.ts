import { deleteBlob, getBlob, listBlobsForLog, putBlob } from '@/lib/db/idb';
import { compressImage, uploadFile, validateUpload } from '@/lib/storage';
import { getSupabase } from '@/lib/supabase';
import { sha256Blob } from '@/lib/hash';
import { newUuid } from '@/lib/ids';
import type { FocusItemRow } from './types';

/**
 * תמונות של דגשי ביקור.
 *
 * התמונה נשמרת תמיד קודם כול במכשיר (IndexedDB), כדי שצילום בשטח בלי
 * קליטה לא ילך לאיבוד. אם יש חיבור — היא מועלית מיד לאחסון הפרטי; אם
 * אין — היא ממתינה, והעלאה מתבצעת כשהחיבור חוזר.
 */

/** ה-blobs של ביקור נשמרים תחת מזהה לוגי אחד, כדי למצוא אותם בהמשך. */
export function visitBlobScope(visitId: string): string {
  return `visit:${visitId}`;
}

export interface StoredVisitPhoto {
  blobId: string;
  visitId: string;
  focusItemId: string | null;
  uploadedPath: string | null;
  blob: Blob;
}

/** שמירת תמונה מקומית. מחזיר את מזהה ה-blob. */
export async function storeVisitPhoto(visitId: string, file: Blob, focusItemId: string | null): Promise<string> {
  const compressed = file.type.startsWith('image/') ? await compressImage(file) : file;
  const validation = validateUpload(compressed);
  if (!validation.ok) throw new Error(validation.error);

  const blobId = `${visitBlobScope(visitId)}|${focusItemId ?? 'visit'}|${newUuid()}`;
  await putBlob({
    id: blobId,
    blob: compressed,
    mimeType: compressed.type,
    sizeBytes: compressed.size,
    logId: visitBlobScope(visitId),
    kind: 'photo',
    sha256: await sha256Blob(compressed),
    createdAt: new Date().toISOString(),
    uploadedPath: null,
  });
  return blobId;
}

export async function listVisitPhotos(visitId: string): Promise<StoredVisitPhoto[]> {
  const blobs = await listBlobsForLog(visitBlobScope(visitId));
  return blobs.map((entry) => {
    const [, focusItemId] = entry.id.split('|');
    return {
      blobId: entry.id,
      visitId,
      focusItemId: focusItemId && focusItemId !== 'visit' ? focusItemId : null,
      uploadedPath: entry.uploadedPath,
      blob: entry.blob,
    };
  });
}

export async function removeVisitPhoto(blobId: string): Promise<void> {
  await deleteBlob(blobId);
}

/**
 * העלאת התמונות שממתינות. נקראת כשנפתח הביקור עם חיבור, וגם באירוע
 * online. מחזירה מיפוי של blobId למזהה הקובץ בשרת.
 */
export async function uploadPendingVisitPhotos(
  visitId: string,
  organizationId: string,
): Promise<Record<string, string>> {
  const pending = (await listBlobsForLog(visitBlobScope(visitId))).filter((entry) => !entry.uploadedPath);
  const uploaded: Record<string, string> = {};

  for (const entry of pending) {
    const result = await uploadFile(organizationId, entry.blob, { folder: `visits/${visitId}` });
    const { data, error } = await getSupabase()
      .from('attachments')
      .insert({
        organization_id: organizationId,
        pest_log_id: null,
        kind: 'photo',
        storage_bucket: result.bucket,
        storage_path: result.path,
        mime_type: result.mimeType,
        size_bytes: result.sizeBytes,
        sha256: result.sha256,
        caption: 'תמונה מדגש ביקור',
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);

    const stored = await getBlob(entry.id);
    if (stored) await putBlob({ ...stored, uploadedPath: result.path });
    uploaded[entry.id] = data.id as string;
  }

  return uploaded;
}

/** מקשר תמונות שהועלו לדגשים שלהן. */
export function attachUploadedPhotos(
  items: FocusItemRow[],
  uploaded: Record<string, string>,
): FocusItemRow[] {
  const byFocusItem = new Map<string, string>();
  for (const [blobId, attachmentId] of Object.entries(uploaded)) {
    const [, focusItemId] = blobId.split('|');
    if (focusItemId && focusItemId !== 'visit') byFocusItem.set(focusItemId, attachmentId);
  }
  return items.map((item) => {
    const attachmentId = byFocusItem.get(item.id);
    return attachmentId && !item.attachmentId ? { ...item, attachmentId } : item;
  });
}
