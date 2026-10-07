/**
 * זמן כניסה מחדש.
 *
 * כלל בטיחות: אי אפשר לקבוע זמן כניסה לעבודה כולה אם לא ידוע הזמן
 * של כל תכשיר שנעשה בו שימוש. במקרה כזה אין להציג מספר שעות כתשובה
 * סופית, גם אם לחלק מהתכשירים יש זמן ידוע. ערך חלקי מוצג רק כשהוא
 * מסומן במפורש כחלקי.
 */

import type { ActionKind, MaterialLabel } from '../types';

export interface MaterialForReEntry {
  name: string;
  label?: MaterialLabel;
}

export type ReEntryStatus =
  /** ידוע לכל התכשירים, ויש זמן מספרי */
  | 'determinate'
  /** חסר מידע לפחות לתכשיר אחד – אין תשובה סופית */
  | 'incomplete'
  /** כל התכשירים הם פיתיון, ולא בוצעה פעולת ריסוס */
  | 'bait_only'
  /** לא נבחרו תכשירים כלל */
  | 'no_materials';

export interface ReEntryResult {
  status: ReEntryStatus;
  /** הזמן המחמיר מבין הידועים. null כשאין זמן רלוונטי. */
  strictestKnownHours: number | null;
  /** זמנים ידועים לכל תכשיר, לצורך הצגה חלקית מסומנת. */
  known: { material: string; hours: number }[];
  /** תכשירים שזמן הכניסה שלהם אינו ידוע או שהתווית אינה מאומתת. */
  missing: string[];
  /** הוראות שאינן מספר שעות ואין להחליפן בחישוב. */
  specialInstructions: { material: string; text: string }[];
  /** סתירה: תועדה פעולת ריסוס אך כל התכשירים מסומנים כפיתיון. */
  inconsistentBaitClaim: boolean;
}

const SPRAY_ACTIONS: ActionKind[] = ['spraying', 'spot_treatment'];

export function hasSprayAction(actions: { kind: ActionKind }[]): boolean {
  return actions.some((a) => SPRAY_ACTIONS.includes(a.kind));
}

/**
 * תווית נחשבת כמספקת זמן כניסה רק אם היא מאומתת.
 * תווית שאינה מאומתת אינה ראיה, גם אם מופיע בה מספר.
 */
function providesReEntry(label: MaterialLabel | undefined): boolean {
  return Boolean(label) && label!.verificationStatus === 'verified';
}

export function computeReEntry(
  materials: MaterialForReEntry[],
  options: { sprayPerformed?: boolean } = {},
): ReEntryResult {
  const known: { material: string; hours: number }[] = [];
  const missing: string[] = [];
  const specialInstructions: { material: string; text: string }[] = [];
  let baitCount = 0;

  for (const { name, label } of materials) {
    if (label?.reEntryNote) specialInstructions.push({ material: name, text: label.reEntryNote });

    if (!providesReEntry(label)) {
      // כולל תווית חסרה, תווית שאינה מאומתת, וזמן שלא הוזן
      missing.push(name);
      continue;
    }
    if (label!.reEntryHours === null) { baitCount += 1; continue; }
    if (typeof label!.reEntryHours === 'number') {
      known.push({ material: name, hours: label!.reEntryHours });
      continue;
    }
    missing.push(name);
  }

  const strictestKnownHours = known.length
    ? known.reduce((max, k) => Math.max(max, k.hours), 0)
    : null;

  if (materials.length === 0) {
    return {
      status: 'no_materials', strictestKnownHours: null, known, missing,
      specialInstructions, inconsistentBaitClaim: false,
    };
  }

  if (missing.length > 0) {
    return {
      status: 'incomplete', strictestKnownHours, known, missing,
      specialInstructions, inconsistentBaitClaim: false,
    };
  }

  // הכול ידוע. פיתיון בלבד נקבע רק אם גם לא תועדה פעולת ריסוס.
  if (known.length === 0 && baitCount === materials.length) {
    const inconsistent = Boolean(options.sprayPerformed);
    return {
      status: inconsistent ? 'incomplete' : 'bait_only',
      strictestKnownHours: null,
      known,
      missing: inconsistent ? ['תועדה פעולת ריסוס אך כל התכשירים מסומנים כפיתיון'] : [],
      specialInstructions,
      inconsistentBaitClaim: inconsistent,
    };
  }

  return {
    status: 'determinate', strictestKnownHours, known, missing,
    specialInstructions, inconsistentBaitClaim: false,
  };
}

/** נוסח קצר ואחיד למסמך ולמסך. אינו ממציא מספר כשאין. */
export function reEntryHeadline(result: ReEntryResult): string {
  switch (result.status) {
    case 'determinate':
      return `אין להיכנס לשטח המטופל במשך ${result.strictestKnownHours} שעות.`;
    case 'bait_only':
      return 'לא חל זמן כניסה מחדש של ריסוס — הטיפול בוצע בפיתיון בתיבות האכלה.';
    case 'no_materials':
      return 'לא נעשה שימוש בתכשיר, ולכן אין זמן כניסה מחדש.';
    case 'incomplete':
    default:
      return 'לא ניתן לקבוע זמן כניסה מחדש לעבודה זו: חסר מידע מאומת לפחות לתכשיר אחד.';
  }
}
