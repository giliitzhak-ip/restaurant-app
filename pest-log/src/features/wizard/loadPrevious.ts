import type { Mutable } from '@/lib/paths';

/**
 * טעינה מיומן קודם.
 *
 * זהו האח של שכפול היומן מהארכיון, אבל מתוך האשף: הוא ממלא את מה
 * שחוזר על עצמו אצל אותו לקוח, ומשאיר ריק את מה שחייב להיקבע בטיפול
 * הנוכחי. הכללים זהים לשכפול, כדי שלא תהיה דרך עקיפה להעתיק תאריך,
 * חתימה, אצווה או מינון.
 */

export type PreviousLogMode = 'all' | 'applications';

export interface LoadPreviousResult {
  content: Mutable;
  /** מה נטען — מוצג למשתמש. */
  copied: string[];
  /** מה לא נטען בכוונה. */
  cleared: string[];
}

const NEVER_COPIED = [
  'תאריך ושעת ביצוע',
  'חתימות',
  'נקודת ציון',
  'מספרי אצווה',
  'מינונים',
  'אישור האזהרות ואסמכתת התווית',
  'מועד המסירה',
];

function stripApplication(application: Mutable): Mutable {
  const next: Mutable = { ...application };
  delete next.id;
  delete next.batchNumber;
  delete next.dosage;
  delete next.dosageValue;
  delete next.quantityUsed;
  return next;
}

export function loadFromPreviousLog(
  source: Record<string, unknown>,
  current: Mutable,
  mode: PreviousLogMode,
): LoadPreviousResult {
  const next: Mutable = structuredClone(current);
  const previous = structuredClone(source) as Mutable;
  const copied: string[] = [];

  if (Array.isArray(previous.applications)) {
    next.applications = (previous.applications as Mutable[]).map(stripApplication);
    copied.push('תכשירים ושיטות יישום');
  }

  if (mode === 'all') {
    if (previous.monitoring) {
      const monitoring = previous.monitoring as Mutable;
      next.monitoring = {
        ...monitoring,
        findings: Array.isArray(monitoring.findings)
          ? (monitoring.findings as Mutable[]).map((finding) => {
              const copy: Mutable = { ...finding };
              delete copy.id;
              return copy;
            })
          : [],
      };
      copied.push('ממצאי ניטור');
    }
    if (previous.prevention) {
      const prevention = previous.prevention as Mutable;
      next.prevention = {
        ...prevention,
        actions: Array.isArray(prevention.actions)
          ? (prevention.actions as Mutable[]).map((action) => {
              const copy: Mutable = { ...action };
              delete copy.id;
              return copy;
            })
          : [],
      };
      copied.push('פעולות מניעה ונסיבות');
    }
    if (previous.treatmentKinds) {
      next.treatmentKinds = previous.treatmentKinds;
      copied.push('סוגי ההדברה');
    }
    if (previous.warranty) {
      next.warranty = previous.warranty;
      copied.push('תנאי אחריות');
    }

    // אזהרות: הטקסט נטען, האישור והאסמכתה נמחקים ומחייבים אימות מחדש.
    if (previous.preWarnings) {
      const pre = previous.preWarnings as Mutable;
      delete pre.acknowledgedByExterminator;
      delete pre.acknowledgedAt;
      delete pre.labelReference;
      delete pre.reEntryHours;
      next.preWarnings = pre;
    }
    if (previous.postWarnings) {
      const post = previous.postWarnings as Mutable;
      delete post.acknowledgedByExterminator;
      delete post.acknowledgedAt;
      next.postWarnings = post;
    }
    if (previous.preWarnings || previous.postWarnings) {
      copied.push('נוסח האזהרות (ללא האישור וללא זמן הכניסה מחדש)');
    }
  }

  // מה שלעולם אינו עובר — גם אם הוא קיים בטיוטה הנוכחית מהעתקה קודמת.
  delete next.signatures;
  const location = next.location as Mutable | undefined;
  if (location) delete location.coordinates;
  next.execution = {
    timeZone: ((current.execution as Mutable | undefined)?.timeZone as string) ?? 'Asia/Jerusalem',
  };
  const handover = next.handover as Mutable | undefined;
  if (handover) delete handover.deliveredAt;

  return { content: next, copied, cleared: NEVER_COPIED };
}
