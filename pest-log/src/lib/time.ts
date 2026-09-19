/**
 * זמן שרת.
 *
 * דרישה: להשתמש בזמן השרת ולא רק בשעון המכשיר. המערכת מודדת פעם אחת את
 * ההיסט בין שעון המכשיר לשעון השרת ומחזיקה אותו; כל חותמת זמן שנרשמת
 * ביומן מתוקנת לפי ההיסט. חותמות הזמן הקובעות (completed_at) נקבעות
 * בכל מקרה ב-Postgres עצמו.
 */

let offsetMs = 0;
let lastSyncedAt: number | null = null;

/** מרווח מקסימלי שנחשב "סביר" להיסט לפני שמוצגת אזהרה למשתמש. */
export const CLOCK_DRIFT_WARNING_MS = 5 * 60 * 1000;

export function setServerTimeOffset(ms: number): void {
  offsetMs = ms;
  lastSyncedAt = Date.now();
}

export function getServerTimeOffset(): number {
  return offsetMs;
}

/** האם שעון המכשיר סוטה מהשרת בצורה שמחייבת אזהרה. */
export function hasSignificantClockDrift(): boolean {
  return Math.abs(offsetMs) > CLOCK_DRIFT_WARNING_MS;
}

export function serverNow(): Date {
  return new Date(Date.now() + offsetMs);
}

export function serverNowIso(): string {
  return serverNow().toISOString();
}

export function serverTimeLastSyncedAt(): number | null {
  return lastSyncedAt;
}

/**
 * מודד את ההיסט מול השרת. מקבל פונקציה שמחזירה את זמן השרת,
 * כדי שהמודול לא יהיה תלוי ב-Supabase או ב-fetch ספציפי.
 */
export async function syncServerTime(fetchServerTime: () => Promise<Date | null>): Promise<boolean> {
  const before = Date.now();
  const server = await fetchServerTime();
  if (!server) return false;
  const after = Date.now();
  // מתקנים חצי מזמן ההלוך-חזור.
  const roundTrip = after - before;
  setServerTimeOffset(server.getTime() - (before + roundTrip / 2));
  return true;
}

/** תאריך מקומי בפורמט YYYY-MM-DD לפי אזור זמן נתון. */
export function toDateInput(date: Date, timeZone = 'Asia/Jerusalem'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return parts;
}

/** שעה בפורמט HH:MM לפי אזור זמן נתון. */
export function toTimeInput(date: Date, timeZone = 'Asia/Jerusalem'): string {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/** תאריך ושעה לתצוגה בעברית. */
export function formatDateTimeHe(value: string | Date, timeZone = 'Asia/Jerusalem'): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('he-IL', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatDateHe(value: string | Date, timeZone = 'Asia/Jerusalem'): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('he-IL', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}
