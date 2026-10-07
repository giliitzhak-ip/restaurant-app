/**
 * אחסון מקומי עמיד: IndexedDB עם נפילה ל-localStorage ולזיכרון.
 * מבטיח שהנתונים לא ילכו לאיבוד גם ללא רשת וגם אחרי רענון.
 */

const DB_NAME = 'yizhak-pest-journal';
const DB_VERSION = 1;
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, unknown>();

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (db) {
    try {
      return await new Promise<T | null>((resolve) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve((req.result as T) ?? null);
        req.onerror = () => resolve(null);
      });
    } catch {
      /* ממשיכים לנפילה */
    }
  }
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* ממשיכים לנפילה */
  }
  return (memory.get(key) as T) ?? null;
}

/**
 * היכן נשמרו הנתונים בפועל.
 * 'memory' אינו אחסון קבוע: הוא נעלם עם סגירת הכרטיסייה,
 * ואסור להציג אותו למשתמש כשמירה מוצלחת.
 */
export type StorageMedium = 'indexeddb' | 'localstorage' | 'memory';

export interface SaveOutcome {
  medium: StorageMedium;
  durable: boolean;
  /** שגיאות שהתרחשו בדרך, לצורך הצגה ותיקון. */
  errors: string[];
}

function describe(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

/**
 * שומר ומחזיר תוצאה מפורשת. אינו בולע כשלים בשקט:
 * כשאין אחסון קבוע, durable יהיה false ועל המסך להציג כשל.
 */
export async function kvSet<T>(key: string, value: T): Promise<SaveOutcome> {
  memory.set(key, value);
  const errors: string[] = [];

  const db = await openDb();
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      return { medium: 'indexeddb', durable: true, errors };
    } catch (err) {
      errors.push(`IndexedDB: ${describe(err)}`);
    }
  } else {
    errors.push('IndexedDB אינו זמין בדפדפן זה.');
  }

  try {
    localStorage.setItem(key, JSON.stringify(value));
    return { medium: 'localstorage', durable: true, errors };
  } catch (err) {
    errors.push(`localStorage: ${describe(err)}`);
  }

  // הנתונים בזיכרון בלבד — ייעלמו עם סגירת הכרטיסייה
  return { medium: 'memory', durable: false, errors };
}
