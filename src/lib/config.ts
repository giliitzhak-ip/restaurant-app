/**
 * הגדרות זמן בנייה.
 *
 * STANDALONE = בנייה ללא שרת (למשל הדגמה מתארחת סטטית):
 * אין סנכרון לשרת ואין רישום service worker. כל הנתונים נשמרים במכשיר בלבד.
 */
export const STANDALONE = import.meta.env.VITE_STANDALONE === '1';
