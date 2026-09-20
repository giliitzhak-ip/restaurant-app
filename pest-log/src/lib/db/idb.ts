import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SyncState } from '@/schema/enums';

/**
 * IndexedDB — המסד המקומי של האפליקציה.
 *
 * כאן נשמרות הטיוטות, תור הפעולות הממתינות לסנכרון, והקבצים (תמונות
 * וחתימות) עד להעלאתם. localStorage אינו משמש כמסד נתונים ראשי — הוא
 * נקרא פעם אחת בלבד ע"י מנגנון הייבוא מהגרסה המקומית הקודמת.
 */

export const DB_NAME = 'yomen-hadbara';
export const DB_VERSION = 1;

export interface StoredDraft {
  id: string;
  organizationId: string;
  /** תוכן חלקי של היומן. הוולידציה המלאה מתבצעת רק בהשלמה. */
  content: Record<string, unknown>;
  /** גרסת הרשומה בשרת, לנעילה אופטימיסטית. null = טרם סונכרן. */
  serverVersion: number | null;
  /** מפתח אידמפוטנטיות ליצירה הראשונית בשרת. */
  idempotencyKey: string;
  /** עודכן מקומית. */
  updatedAt: string;
  /** נשמר בהצלחה בשרת בפעם האחרונה. */
  syncedAt: string | null;
  syncState: SyncState;
  lastError: string | null;
  /** טביעת אצבע של התוכן שסונכרן — כדי לא לשלוח שוב תוכן זהה. */
  syncedFingerprint: string | null;
  /** יומן שהושלם נשמר מקומית לקריאה בלבד. */
  readOnly: boolean;
  serialNumber: number | null;
  status: 'draft' | 'completed' | 'cancelled';
}

export type OutboxOperationType =
  | 'upsert_draft'
  | 'complete_log'
  | 'upload_attachment'
  | 'upsert_client'
  | 'upsert_site'
  | 'upsert_bait_station'
  | 'cancel_log'
  | 'correct_log'
  // מסלול עבודה: כל שינוי בתחנה, בדגשים ובסדר עובר דרך אותו תור, כדי
  // שגם עבודה ללא קליטה תסתנכרן בלי כפילויות.
  | 'upsert_route'
  | 'upsert_route_visit'
  | 'delete_route_visit'
  | 'upsert_focus_item'
  | 'delete_focus_item'
  | 'reorder_route'
  | 'upsert_route_template'
  // פונקציות שהועברו מהגרסה הקודמת: ספריות ניסוח ומאגר תחנות לאתר.
  | 'upsert_text_template'
  | 'delete_text_template'
  | 'upsert_site_station';

export interface OutboxOperation {
  /** מפתח האידמפוטנטיות הוא גם המפתח הראשי — אין כפילויות. */
  idempotencyKey: string;
  type: OutboxOperationType;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  /** זמן העדכון בלקוח, ליישוב התנגשויות בשרת. */
  clientUpdatedAt: string;
  attempts: number;
  lastError: string | null;
  status: 'pending' | 'inflight' | 'failed';
  /** לא לנסות לפני הזמן הזה (backoff). */
  nextAttemptAt: string;
}

export interface StoredBlob {
  id: string;
  blob: Blob;
  mimeType: string;
  sizeBytes: number;
  /** למה הקובץ שייך. */
  logId: string | null;
  kind: 'photo' | 'signature' | 'pdf';
  sha256: string | null;
  createdAt: string;
  uploadedPath: string | null;
}

export interface CacheEntry {
  key: string;
  value: unknown;
  updatedAt: string;
}

interface YomenDB extends DBSchema {
  drafts: {
    key: string;
    value: StoredDraft;
    indexes: { 'by-updatedAt': string; 'by-syncState': string; 'by-status': string };
  };
  outbox: {
    key: string;
    value: OutboxOperation;
    indexes: { 'by-createdAt': string; 'by-status': string };
  };
  blobs: {
    key: string;
    value: StoredBlob;
    indexes: { 'by-logId': string };
  };
  cache: { key: string; value: CacheEntry };
  meta: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<YomenDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<YomenDB>> {
  dbPromise ??= openDB<YomenDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('drafts')) {
        const drafts = db.createObjectStore('drafts', { keyPath: 'id' });
        drafts.createIndex('by-updatedAt', 'updatedAt');
        drafts.createIndex('by-syncState', 'syncState');
        drafts.createIndex('by-status', 'status');
      }
      if (!db.objectStoreNames.contains('outbox')) {
        const outbox = db.createObjectStore('outbox', { keyPath: 'idempotencyKey' });
        outbox.createIndex('by-createdAt', 'createdAt');
        outbox.createIndex('by-status', 'status');
      }
      if (!db.objectStoreNames.contains('blobs')) {
        const blobs = db.createObjectStore('blobs', { keyPath: 'id' });
        blobs.createIndex('by-logId', 'logId');
      }
      if (!db.objectStoreNames.contains('cache')) {
        db.createObjectStore('cache', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta');
      }
    },
  });
  return dbPromise;
}

/** לבדיקות: איפוס החיבור המוכן. */
export function resetDbPromiseForTests(): void {
  dbPromise = null;
}

/* ── טיוטות ───────────────────────────────────────────────────────────────── */

export async function putDraft(draft: StoredDraft): Promise<void> {
  const db = await getDb();
  await db.put('drafts', draft);
}

export async function getDraft(id: string): Promise<StoredDraft | undefined> {
  const db = await getDb();
  return db.get('drafts', id);
}

export async function deleteDraft(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('drafts', id);
}

export async function listDrafts(): Promise<StoredDraft[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('drafts', 'by-updatedAt');
  return all.reverse();
}

/* ── תור הסנכרון ──────────────────────────────────────────────────────────── */

export async function enqueueOperation(op: OutboxOperation): Promise<void> {
  const db = await getDb();
  const existing = await db.get('outbox', op.idempotencyKey);
  if (existing) {
    // אותו מפתח = אותה פעולה. מעדכנים את ה-payload ולא יוצרים פעולה נוספת.
    await db.put('outbox', {
      ...existing,
      payload: op.payload,
      clientUpdatedAt: op.clientUpdatedAt,
      status: existing.status === 'inflight' ? 'pending' : existing.status,
      nextAttemptAt: new Date().toISOString(),
    });
    return;
  }
  await db.put('outbox', op);
}

export async function listPendingOperations(): Promise<OutboxOperation[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('outbox', 'by-createdAt');
  return all.filter((op) => op.status !== 'inflight');
}

/**
 * כל הפעולות שבתור, כולל אלה שנמצאות כרגע בשליחה.
 * משמש להצגת מצב אמיתי במסך: פעולה שנשלחת ברגע זה היא עדיין האמת של
 * המכשיר, גם אם התשובה מהשרת טרם חזרה.
 */
export async function listAllOperations(): Promise<OutboxOperation[]> {
  const db = await getDb();
  return db.getAllFromIndex('outbox', 'by-createdAt');
}

export async function updateOperation(op: OutboxOperation): Promise<void> {
  const db = await getDb();
  await db.put('outbox', op);
}

export async function removeOperation(idempotencyKey: string): Promise<void> {
  const db = await getDb();
  await db.delete('outbox', idempotencyKey);
}

export async function countPendingOperations(): Promise<number> {
  const db = await getDb();
  const all = await db.getAll('outbox');
  return all.filter((op) => op.status !== 'failed').length;
}

export async function countFailedOperations(): Promise<number> {
  const db = await getDb();
  const all = await db.getAll('outbox');
  return all.filter((op) => op.status === 'failed').length;
}

/* ── קבצים ────────────────────────────────────────────────────────────────── */

export async function putBlob(entry: StoredBlob): Promise<void> {
  const db = await getDb();
  await db.put('blobs', entry);
}

export async function getBlob(id: string): Promise<StoredBlob | undefined> {
  const db = await getDb();
  return db.get('blobs', id);
}

export async function listBlobsForLog(logId: string): Promise<StoredBlob[]> {
  const db = await getDb();
  return db.getAllFromIndex('blobs', 'by-logId', logId);
}

export async function deleteBlob(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('blobs', id);
}

/* ── מטמון לעבודה ללא קליטה ───────────────────────────────────────────────── */

export async function putCache(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put('cache', { key, value, updatedAt: new Date().toISOString() });
}

export async function getCache<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  const entry = await db.get('cache', key);
  return entry?.value as T | undefined;
}

/* ── מטא ──────────────────────────────────────────────────────────────────── */

export async function putMeta(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put('meta', value, key);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  return (await db.get('meta', key)) as T | undefined;
}

/** מנקה את כל הנתונים המקומיים (התנתקות / איפוס). */
export async function clearLocalData(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.clear('drafts'),
    db.clear('outbox'),
    db.clear('blobs'),
    db.clear('cache'),
    db.clear('meta'),
  ]);
}
