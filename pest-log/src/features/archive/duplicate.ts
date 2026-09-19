import type { Mutable } from '@/lib/paths';

/**
 * שכפול יומן קודם.
 *
 * מה נשמר: הצדדים, המקום, סוגי ההדברה, המזיקים, פעולות המניעה, רשימת
 * התכשירים ושיטות היישום — כל מה שחוזר על עצמו בין ביקורים.
 *
 * מה נמחק בכוונה, כי הוא חייב להיקבע מחדש בכל ביצוע:
 *  - תאריך ושעת הביצוע
 *  - החתימות
 *  - נ״צ (GPS)
 *  - המספר הסידורי, ה-hash וכל מטא-נתוני ההשלמה
 *  - מספר האצווה והמינון של כל תכשיר
 *  - מועד המסירה
 *  - אישור האזהרות ואסמכתת התווית — יש לאמת אותם מחדש
 */

export interface DuplicateResult {
  content: Mutable;
  /** מה שנוקה — מוצג למשתמש כדי שידע מה עליו למלא מחדש. */
  clearedFields: string[];
}

export function duplicateLogContent(source: Mutable): DuplicateResult {
  const cleared: string[] = [];
  const content: Mutable = structuredClone(source);

  // מטא-נתוני היומן המקורי לא עוברים לשכפול.
  delete content.meta;

  content.execution = {
    timeZone: (content.execution as Mutable | undefined)?.timeZone ?? 'Asia/Jerusalem',
  };
  cleared.push('תאריך ושעת ביצוע ההדברה');

  delete content.signatures;
  cleared.push('חתימות');

  const location = content.location as Mutable | undefined;
  if (location) {
    delete location.coordinates;
    cleared.push('נ״צ (קואורדינטות)');
  }

  if (Array.isArray(content.applications)) {
    content.applications = (content.applications as Mutable[]).map((application) => {
      const next: Mutable = { ...application };
      delete next.id;
      delete next.batchNumber;
      delete next.dosage;
      return next;
    });
    if ((content.applications as Mutable[]).length > 0) {
      cleared.push('מספר אצווה ומינון בכל תכשיר');
    }
  }

  // האזהרות נשמרות כטקסט, אך האישור והאסמכתה נמחקים: יש לאמת מחדש
  // מול תווית תקפה לפני השלמת היומן החדש.
  const preWarnings = content.preWarnings as Mutable | undefined;
  if (preWarnings) {
    delete preWarnings.acknowledgedByExterminator;
    delete preWarnings.acknowledgedAt;
    delete preWarnings.labelReference;
    cleared.push('אישור האזהרות ואסמכתת התווית — נדרש אימות מחדש');
  }
  const postWarnings = content.postWarnings as Mutable | undefined;
  if (postWarnings) {
    delete postWarnings.acknowledgedByExterminator;
    delete postWarnings.acknowledgedAt;
  }

  const handover = content.handover as Mutable | undefined;
  if (handover) {
    delete handover.deliveredAt;
    delete handover.delivered;
    cleared.push('אישור ומועד מסירת היומן');
  }

  // מזהי שורות של היומן הקודם לא מועתקים.
  for (const key of ['monitoring', 'prevention'] as const) {
    const section = content[key] as Mutable | undefined;
    if (!section) continue;
    const listKey = key === 'monitoring' ? 'findings' : 'actions';
    const list = section[listKey];
    if (Array.isArray(list)) {
      section[listKey] = (list as Mutable[]).map((item) => {
        const next = { ...item };
        delete next.id;
        return next;
      });
    }
  }
  if (Array.isArray(content.assistants)) {
    content.assistants = (content.assistants as Mutable[]).map((assistant) => {
      const next = { ...assistant };
      delete next.id;
      delete next.signature;
      delete next.receivedLogCopyAt;
      next.receivedLogCopy = false;
      return next;
    });
    if ((content.assistants as Mutable[]).length > 0) cleared.push('חתימת המדביר המסייע');
  }
  if (Array.isArray(content.attachments)) content.attachments = [];

  // תיעוד איוד/ערפול הוא לביצוע מסוים ולא מועתק.
  if (content.fumigation) {
    delete content.fumigation;
    cleared.push('תיעוד פעולות האיטום (איוד)');
  }
  if (content.fogging) {
    delete content.fogging;
    cleared.push('תיעוד ההתראה לציבור (ערפול)');
  }

  return { content, clearedFields: cleared };
}
