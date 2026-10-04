/**
 * הגדרות זמן בנייה.
 *
 * STANDALONE=1 — בנייה ללא שרת (הדגמה או אירוח סטטי):
 *   אין סנכרון לשרת ואין רישום service worker. הנתונים נשמרים במכשיר בלבד.
 *
 * VITE_API_BASE — כתובת מלאה של השרת, לדוגמה https://api.example.co.il
 *   נדרש באפליקציה מקומפלת (Capacitor): שם ה-webview רץ מ-capacitor://localhost
 *   או http://localhost, ולכן נתיב יחסי כמו /api/sync לא יגיע לשרת.
 *   כשהאפליקציה מוגשת מאותו שרת (PWA), אפשר להשאיר ריק.
 */

export const STANDALONE = import.meta.env.VITE_STANDALONE === '1';

/** בסיס ה-API ללא לוכסן בסוף. ריק = אותו מקור שממנו נטענה האפליקציה. */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '');

/** בונה כתובת API מלאה. `path` מתחיל בלוכסן. */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/** האם האפליקציה רצה בתוך מעטפת Capacitor (אפליקציה מקומפלת). */
export function isNativeShell(): boolean {
  return typeof window !== 'undefined' && 'Capacitor' in window;
}
