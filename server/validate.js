/**
 * ולידציה בצד השרת.
 *
 * הכללים מיובאים מ-shared/journalRules.mjs – אותו קובץ שהלקוח
 * מייבא. אין כאן עותק שני של הכללים, ולכן אי אפשר לעקוף אותם
 * מצד הלקוח ואי אפשר ששני הצדדים ייפרדו בשקט.
 */

export {
  EXECUTION_FIELDS,
  deletionRefusal,
  payloadErrors as validatePayload,
} from '../shared/journalRules.mjs';

import { deletionRefusal } from '../shared/journalRules.mjs';

/** נוחות לקוד קיים: האם המחיקה מותרת. */
export function isDeletionAllowed(entity, current) {
  return deletionRefusal(entity, current) === null;
}
