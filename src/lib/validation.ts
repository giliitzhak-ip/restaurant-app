import type { FullJournal } from '../types';
import { blockingOnly, journalIssues, type Issue } from '../../shared/journalRules.mjs';

export type { Issue };

/**
 * ולידציה של יומן לפני סיום.
 *
 * הכללים עצמם יושבים ב-shared/journalRules.mjs ונטענים גם בשרת,
 * כדי שלא יהיו שני עותקים שיכולים להיפרד זה מזה. שמירת טיוטה
 * אף פעם אינה חסומה – רק סיום היומן.
 */
export function validateJournal(full: FullJournal, now?: Date): Issue[] {
  return journalIssues(full, now);
}

export const blockingIssues = (issues: Issue[]): Issue[] => blockingOnly(issues);
