import { listDrafts } from '@/lib/db/idb';
import { contentFingerprint } from '@/lib/hash';
import type { SyncEngine } from './engine';

/**
 * יישוב טיוטות שלא הספיקו להיכנס לתור הסנכרון.
 *
 * השמירה המקומית מיידית, אך השליחה לשרת עוברת השהיה קצרה (debounce).
 * אם הדף נסגר או רוענן לפני שההשהיה הסתיימה — התוכן נשמר במכשיר אך לא
 * נרשם בתור, ולכן לא היה מסונכרן לעולם. כאן נסרקות כל הטיוטות, וכל טיוטה
 * שתוכנה שונה ממה שסונכרן בפועל נכנסת לתור.
 *
 * מפתח האידמפוטנטיות נגזר מטביעת האצבע של התוכן, ולכן הרצה חוזרת אינה
 * יוצרת כפילויות.
 */
export async function reconcilePendingDrafts(syncEngine: SyncEngine): Promise<number> {
  const drafts = await listDrafts();
  let queued = 0;

  for (const draft of drafts) {
    if (draft.readOnly || draft.status !== 'draft') continue;

    const fingerprint = await contentFingerprint(draft.content);
    if (fingerprint === draft.syncedFingerprint) continue;

    await syncEngine.enqueue(
      'upsert_draft',
      draft.id,
      {
        organizationId: draft.organizationId,
        content: draft.content,
        expectedVersion: draft.serverVersion,
        fingerprint,
      },
      fingerprint.slice(0, 16),
    );
    queued += 1;
  }

  return queued;
}
