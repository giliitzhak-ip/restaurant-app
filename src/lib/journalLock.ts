import type { Journal } from '../types';

/**
 * יומן שהושלם או נשלח נעול לעריכה.
 *
 * הסיבה אינה טכנית: המסמך נמסר ללקוח ונחתם, ושינוי בדיעבד הופך
 * את התיעוד לבלתי-אמין. תיקון נעשה ביומן חדש (ביקור חוזר), או
 * בביטול מתועד עם סיבה. מחיקה אינה אפשרות.
 */
export function isJournalLocked(journal: Journal | undefined): boolean {
  return journal?.status === 'completed' || journal?.status === 'sent';
}

export const JOURNAL_LOCK_REASON =
  'היומן הושלם ונעול לעריכה. לתיקון יש לפתוח ביקור חוזר, או לבטל את היומן עם סיבה מתועדת.';
