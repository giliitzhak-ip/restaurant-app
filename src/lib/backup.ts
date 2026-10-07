import type { AppState } from '../types';

/**
 * גיבוי וייבוא של נתוני המכשיר.
 *
 * הקובץ נושא `schemaVersion`, כדי שייבוא של גיבוי ישן לגרסה חדשה
 * ייכשל בבירור ולא ישתיל נתונים במבנה שלא מתאים. הייבוא אינו
 * דורס: רשומה שקיימת כבר במכשיר נשארת כפי שהיא, והמשתמש רואה
 * כמה רשומות נוספו וכמה דולגו.
 */

export const BACKUP_SCHEMA_VERSION = 1;
const APP_ID = 'yomanhadbara';

/** אוספים שמגיעים עם גרסת הקוד ואינם חלק מהגיבוי של המשתמש. */
const CODE_OWNED: (keyof AppState)[] = ['materials', 'materialLabels'];

export interface BackupFile {
  app: string;
  schemaVersion: number;
  exportedAt: string;
  counts: Record<string, number>;
  state: AppState;
}

interface Identified { id: string }

function collections(state: AppState): (keyof AppState)[] {
  return (Object.keys(state) as (keyof AppState)[]).filter(
    (key) => Array.isArray(state[key]) && !CODE_OWNED.includes(key),
  );
}

export function buildBackup(state: AppState, now = new Date()): BackupFile {
  const counts: Record<string, number> = {};
  /* מאגר התכשירים מגיע עם גרסת הקוד וזהה לכל העסקים. הוא יוצא
     מהקובץ כדי שגיבוי יהיה הנתונים של המשתמש ולא עותק של המאגר. */
  const exported = { ...state } as AppState;
  for (const key of CODE_OWNED) {
    (exported as unknown as Record<string, unknown>)[key] = [];
  }
  for (const key of collections(state)) {
    counts[key] = (state[key] as unknown as unknown[]).length;
  }
  return {
    app: APP_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    counts,
    state: exported,
  };
}

/**
 * שם הקובץ באותיות לטיניות ועם תאריך.
 *
 * שם בעברית נשמר בחלק מהמערכות כ-"download" או בקידוד שבור,
 * ובדוא״ל ובענן הוא נוטה להישבר. התאריך מאפשר לזהות גיבויים.
 */
export function backupFileName(now = new Date()): string {
  const d = now.toISOString().slice(0, 10);
  return `pest-journal-backup-${d}.json`;
}

export type BackupReadResult =
  | { ok: true; file: BackupFile }
  | { ok: false; errors: string[] };

export function readBackup(text: string): BackupReadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['הקובץ אינו JSON תקין.'] };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, errors: ['הקובץ אינו קובץ גיבוי.'] };
  }
  const file = parsed as Partial<BackupFile>;
  const errors: string[] = [];

  if (file.app !== APP_ID) errors.push('הקובץ אינו גיבוי של יומן הדברה.');
  if (typeof file.schemaVersion !== 'number') {
    errors.push('לקובץ אין גרסת מבנה.');
  } else if (file.schemaVersion > BACKUP_SCHEMA_VERSION) {
    errors.push(
      `הגיבוי נוצר בגרסה חדשה יותר (${file.schemaVersion}) מזו שבמכשיר `
      + `(${BACKUP_SCHEMA_VERSION}). יש לעדכן את האפליקציה לפני הייבוא.`,
    );
  }
  if (!file.state || typeof file.state !== 'object') errors.push('הגיבוי אינו מכיל נתונים.');

  if (errors.length) return { ok: false, errors };
  return { ok: true, file: file as BackupFile };
}

/**
 * האם רשומת הפתיחה עדיין "ריקה" – כלומר המשתמש לא נגע בה.
 *
 * כל התקנה נפתחת עם מדביר ומשתמש ברירת מחדל. בייבוא גיבוי לא
 * מועילה רשומה כזו, ולהשאיר אותה לצד הרשומה שיובאה הייתה יוצרת
 * שני מדבירים עם אותו שם. לכן רשומת פתיחה שלא נגעו בה מוחלפת.
 */
function hasSubstance(row: unknown): boolean {
  const e = row as { licenseNumber?: string; phone?: string };
  return Boolean(String(e.licenseNumber ?? '').trim() || String(e.phone ?? '').trim());
}

function isUntouchedExterminator(rows: unknown[]): boolean {
  return rows.length === 1 && !hasSubstance(rows[0]);
}

export interface ImportPlan {
  added: Record<string, number>;
  skipped: Record<string, number>;
  total: number;
}

/**
 * מיזוג גיבוי אל המצב הנוכחי.
 *
 * רשומה קיימת אינה נדרסת: ייבוא אינו יכול למחוק או לשנות תיעוד
 * שכבר במכשיר. המונים מורמים למקסימום, כדי שיומן חדש לא יקבל
 * מספר שכבר בשימוש.
 */
export function mergeBackup(current: AppState, file: BackupFile): {
  state: AppState;
  plan: ImportPlan;
} {
  const added: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const patch: Partial<AppState> = {};
  let total = 0;

  /* רשומת המדביר דורשת טיפול מיוחד, כי כל התקנה נפתחת באחת כזו.
     - גיבוי שבו המדביר ממולא, ובמכשיר יש רק רשומת פתיחה ריקה:
       הרשומה שיובאה מחליפה אותה, כדי שלא יהיו שני מדבירים.
     - גיבוי שבו המדביר ריק: אין מה לייבא, ודילוג עליו מונע
       רשומה כפולה בכל ייבוא חוזר.
     - מדביר שהמשתמש כבר מילא: אינו נדרס לעולם. */
  const incomingExterminators = Array.isArray(file.state.exterminators)
    ? (file.state.exterminators as unknown[])
    : [];
  const incomingIsFilled = incomingExterminators.some(hasSubstance);
  const replaceStarter = incomingIsFilled
    && isUntouchedExterminator(current.exterminators as unknown[]);
  const starterKeys: (keyof AppState)[] = ['exterminators', 'users'];

  for (const key of collections(current)) {
    const incoming = file.state[key] as unknown as Identified[] | undefined;
    if (!Array.isArray(incoming) || incoming.length === 0) continue;

    if (starterKeys.includes(key)) {
      if (replaceStarter) {
        (patch as Record<string, unknown>)[key] = incoming;
        added[key] = incoming.length;
        total += incoming.length;
      } else if (!incomingIsFilled) {
        skipped[key] = incoming.length;
      } else {
        const rows = [...(current[key] as unknown as Identified[])];
        const known = new Set(rows.map((r) => r.id));
        let addedHere = 0;
        for (const row of incoming) {
          if (!row || typeof row.id !== 'string' || known.has(row.id)) {
            skipped[key] = (skipped[key] ?? 0) + 1;
            continue;
          }
          rows.push(row);
          known.add(row.id);
          addedHere += 1;
        }
        if (addedHere > 0) {
          (patch as Record<string, unknown>)[key] = rows;
          added[key] = addedHere;
          total += addedHere;
        }
      }
      continue;
    }

    const rows = [...(current[key] as unknown as Identified[])];
    const known = new Set(rows.map((r) => r.id));
    let addedHere = 0;
    let skippedHere = 0;

    for (const row of incoming) {
      if (!row || typeof row.id !== 'string') { skippedHere += 1; continue; }
      if (known.has(row.id)) { skippedHere += 1; continue; }
      rows.push(row);
      known.add(row.id);
      addedHere += 1;
    }

    if (addedHere > 0) {
      (patch as Record<string, unknown>)[key] = rows;
      added[key] = addedHere;
      total += addedHere;
    }
    if (skippedHere > 0) skipped[key] = skippedHere;
  }

  const counters = {
    journalNumber: Math.max(
      current.counters.journalNumber,
      file.state.counters?.journalNumber ?? 0,
    ),
    customerNumber: Math.max(
      current.counters.customerNumber,
      file.state.counters?.customerNumber ?? 0,
    ),
  };

  /* כשרשומות הפתיחה הוחלפו, גם המשתמש הנוכחי הוא זה שמהגיבוי,
     אחרת הרישום בלוג היה מצביע על משתמש שאינו קיים. */
  const currentUserId = replaceStarter && file.state.currentUserId
    ? file.state.currentUserId
    : current.currentUserId;

  return {
    state: { ...current, ...patch, counters, currentUserId },
    plan: { added, skipped, total },
  };
}
