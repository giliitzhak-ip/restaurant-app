/**
 * מיפוי נתיב-שדה → תווית בעברית + השלב בטופס + סעיף הדרישה.
 * משמש לשלושה דברים:
 *  1. הצגת רשימת שדות חסרים בעברית.
 *  2. לחיצה על שגיאה שמעבירה ישירות לשדה (השלב + מזהה ה-DOM).
 *  3. טבלת ההתאמה ב-docs/legal-compliance-2026.md.
 */

export const WIZARD_STEPS = [
  { index: 1, title: 'פרטי המדביר והמזמין', requirements: [1, 2, 3] },
  { index: 2, title: 'מקום ומועד ההדברה', requirements: [4, 5] },
  { index: 3, title: 'ממצאי ניטור', requirements: [6] },
  { index: 4, title: 'מניעה, תכשירים ויישום', requirements: [7, 10, 11, 12] },
  { index: 5, title: 'אזהרות ומידע', requirements: [8, 13] },
  { index: 6, title: 'מדביר מסייע, מסירה וחתימות', requirements: [9, 14, 15] },
] as const;

export type WizardStepIndex = 1 | 2 | 3 | 4 | 5 | 6;

export interface FieldMeta {
  /** תווית בעברית כפי שמוצגת למשתמש. */
  label: string;
  /** השלב בטופס שבו נמצא השדה. */
  step: WizardStepIndex;
  /** סעיף הדרישה בהוראת הרשם (לפי המפרט). */
  requirement: number;
}

/**
 * תבניות נתיב. `*` מתאים לאינדקס מערך או לכל מקטע בודד.
 * הסדר משמעותי: ההתאמה הראשונה מנצחת.
 */
const PATTERNS: Array<[string, FieldMeta]> = [
  // ── דרישה 1 ──
  ['exterminator.fullName', { label: 'שם המדביר המלא', step: 1, requirement: 1 }],
  ['exterminator.licenseType', { label: 'סוג רישיון המדביר', step: 1, requirement: 1 }],
  ['exterminator.licenseNumber', { label: 'מספר רישיון המדביר', step: 1, requirement: 1 }],
  ['exterminator.mobile', { label: 'טלפון נייד של המדביר', step: 1, requirement: 1 }],
  ['exterminator.email', { label: 'דוא״ל המדביר', step: 1, requirement: 1 }],
  ['exterminator.address', { label: 'כתובת המדביר', step: 1, requirement: 1 }],
  ['exterminator', { label: 'פרטי המדביר', step: 1, requirement: 1 }],

  // ── דרישה 2 ──
  ['operator.name', { label: 'שם מפעיל המדביר', step: 1, requirement: 2 }],
  ['operator.phone', { label: 'טלפון מפעיל המדביר', step: 1, requirement: 2 }],
  ['operator.email', { label: 'דוא״ל מפעיל המדביר', step: 1, requirement: 2 }],
  ['operator.address', { label: 'כתובת מפעיל המדביר', step: 1, requirement: 2 }],
  ['operator', { label: 'פרטי מפעיל המדביר', step: 1, requirement: 2 }],

  // ── דרישה 3 ──
  ['orderer.name', { label: 'שם מזמין ההדברה', step: 1, requirement: 3 }],
  ['orderer.phone', { label: 'טלפון מזמין ההדברה', step: 1, requirement: 3 }],
  ['orderer.mobile', { label: 'טלפון נייד של מזמין ההדברה', step: 1, requirement: 3 }],
  ['orderer.role', { label: 'תפקיד מזמין ההדברה', step: 1, requirement: 3 }],
  ['orderer.isPrivatePerson', { label: 'האם המזמין אדם פרטי', step: 1, requirement: 3 }],
  ['orderer', { label: 'פרטי מזמין ההדברה', step: 1, requirement: 3 }],

  // ── דרישה 4 ──
  ['location.city', { label: 'עיר', step: 2, requirement: 4 }],
  ['location.street', { label: 'רחוב', step: 2, requirement: 4 }],
  ['location.houseNumber', { label: 'מספר בית', step: 2, requirement: 4 }],
  ['location.apartmentNumber', { label: 'מספר דירה', step: 2, requirement: 4 }],
  ['location.structureType', { label: 'סוג המבנה', step: 2, requirement: 4 }],
  ['location.localAuthorityName', { label: 'שם הרשות המקומית', step: 2, requirement: 4 }],
  ['location.siteType', { label: 'סוג האתר', step: 2, requirement: 4 }],
  ['location.siteDescription', { label: 'תיאור האתר', step: 2, requirement: 4 }],
  ['location.neighborhoodName', { label: 'שם השכונה', step: 2, requirement: 4 }],
  ['location.areaDescription', { label: 'תיאור השטח המערופל', step: 2, requirement: 4 }],
  ['location.coordinates.latitude', { label: 'נ״צ — קו רוחב', step: 2, requirement: 4 }],
  ['location.coordinates.longitude', { label: 'נ״צ — קו אורך', step: 2, requirement: 4 }],
  ['location.coordinates.east', { label: 'נ״צ — מזרח', step: 2, requirement: 4 }],
  ['location.coordinates.north', { label: 'נ״צ — צפון', step: 2, requirement: 4 }],
  ['location.coordinates', { label: 'נ״צ (קואורדינטות)', step: 2, requirement: 4 }],
  ['location.placeKind', { label: 'סוג מקום ההדברה', step: 2, requirement: 4 }],
  ['location', { label: 'מקום ההדברה', step: 2, requirement: 4 }],

  // ── דרישה 5 ──
  ['execution.performedDate', { label: 'תאריך ביצוע ההדברה', step: 2, requirement: 5 }],
  ['execution.performedStartTime', { label: 'שעת תחילת ההדברה', step: 2, requirement: 5 }],
  ['execution.performedEndTime', { label: 'שעת סיום ההדברה', step: 2, requirement: 5 }],
  ['execution', { label: 'תאריך ושעת ביצוע ההדברה', step: 2, requirement: 5 }],

  // ── דרישה 6 ──
  ['monitoring.findings.*.pestName', { label: 'שם המזיק', step: 3, requirement: 6 }],
  ['monitoring.findings.*.identificationActions', { label: 'פעולות הזיהוי', step: 3, requirement: 6 }],
  ['monitoring.findings.*.developmentStage', { label: 'דרגת התפתחות', step: 3, requirement: 6 }],
  ['monitoring.findings.*.infestationSigns', { label: 'סימני נגיעות', step: 3, requirement: 6 }],
  ['monitoring.findings.*.findingLocation', { label: 'מיקום הממצא', step: 3, requirement: 6 }],
  ['monitoring.findings.*.infestationLevel', { label: 'רמת נגיעות', step: 3, requirement: 6 }],
  ['monitoring.findings', { label: 'ממצאי ניטור', step: 3, requirement: 6 }],
  ['monitoring', { label: 'ממצאי ניטור', step: 3, requirement: 6 }],

  // ── דרישה 7 ──
  ['prevention.actions.*.description', { label: 'תיאור פעולת המניעה', step: 4, requirement: 7 }],
  ['prevention.actions.*.status', { label: 'מצב פעולת המניעה', step: 4, requirement: 7 }],
  ['prevention.actions', { label: 'פעולות מניעה וטיפול', step: 4, requirement: 7 }],
  [
    'prevention.circumstancesForChoosingPestControl',
    { label: 'הנסיבות שבגללן הוחלט לבצע הדברה ולא טיפול אחר', step: 4, requirement: 7 },
  ],
  ['prevention', { label: 'פעולות מניעה וטיפול', step: 4, requirement: 7 }],

  // ── דרישה 12 ──
  ['applications.*.targetPestName', { label: 'שם המזיק (ביישום התכשיר)', step: 4, requirement: 12 }],
  ['applications.*.productTradeName', { label: 'השם המסחרי של התכשיר', step: 4, requirement: 12 }],
  ['applications.*.batchNumber', { label: 'מספר אצווה / סדרת ייצור', step: 4, requirement: 12 }],
  ['applications.*.activeIngredientName', { label: 'שם החומר הפעיל', step: 4, requirement: 12 }],
  [
    'applications.*.activeIngredientConcentrationPercent',
    { label: 'ריכוז החומר הפעיל בתכשיר (%)', step: 4, requirement: 12 },
  ],
  ['applications.*.dosage', { label: 'מינון', step: 4, requirement: 12 }],
  ['applications.*.dosageUnit', { label: 'יחידת המידה של המינון', step: 4, requirement: 12 }],
  ['applications.*.mixtureKind', { label: 'סוג הכמות (תמיסה / תערובת / מלכודות)', step: 4, requirement: 12 }],
  ['applications.*.mixtureQuantity', { label: 'כמות תמיסה / תערובת / מלכודות', step: 4, requirement: 12 }],
  ['applications.*.mixtureUnit', { label: 'יחידת הכמות', step: 4, requirement: 12 }],
  ['applications.*.quantityBasis', { label: 'בסיס הכמות (אורך / שטח / נפח)', step: 4, requirement: 12 }],
  ['applications.*.basisAmount', { label: 'גודל השטח / האורך / הנפח', step: 4, requirement: 12 }],
  ['applications.*.basisUnit', { label: 'יחידת השטח / האורך / הנפח', step: 4, requirement: 12 }],
  [
    'applications.*.readyToUseConcentrationPercent',
    { label: 'ריכוז החומר הפעיל בתכשיר המוכן לשימוש (%)', step: 4, requirement: 12 },
  ],
  ['applications.*.applicationMethod', { label: 'שיטת היישום', step: 4, requirement: 12 }],
  ['applications', { label: 'תכשירים ויישומים', step: 4, requirement: 12 }],

  // ── דרישה 10 ──
  ['fumigation.sealingActions.*.description', { label: 'תיאור פעולת האיטום', step: 4, requirement: 10 }],
  ['fumigation.sealingActions.*.locationDescription', { label: 'מיקום האיטום', step: 4, requirement: 10 }],
  ['fumigation.sealingActions.*.performedAt', { label: 'מועד ביצוע האיטום', step: 4, requirement: 10 }],
  ['fumigation.sealingActions', { label: 'פעולות איטום לפני איוד', step: 4, requirement: 10 }],
  ['fumigation.sealingCompletedAt', { label: 'מועד סיום פעולות האיטום', step: 4, requirement: 10 }],
  ['fumigation', { label: 'תיעוד איוד', step: 4, requirement: 10 }],

  // ── דרישה 11 ──
  ['fogging.publicWarningGiven', { label: 'האם ניתנה לציבור התראה מראש', step: 4, requirement: 11 }],
  ['fogging.publicWarningMethod', { label: 'אופן ההתראה לציבור', step: 4, requirement: 11 }],
  ['fogging.publicWarningAt', { label: 'מועד ההתראה לציבור', step: 4, requirement: 11 }],
  ['fogging.publicWarningNotGivenReason', { label: 'הסיבה לאי-מתן התראה לציבור', step: 4, requirement: 11 }],
  ['fogging', { label: 'תיעוד ערפול', step: 4, requirement: 11 }],

  // ── דרישה 8 ──
  ['preWarnings.treatmentNatureDescription', { label: 'תיאור טיב ההדברה', step: 5, requirement: 8 }],
  ['preWarnings.risksToHumans', { label: 'סיכונים לאדם', step: 5, requirement: 8 }],
  ['preWarnings.risksToAnimals', { label: 'סיכונים לבעלי חיים', step: 5, requirement: 8 }],
  ['preWarnings.reEntryHours', { label: 'זמן כניסה מחדש (שעות)', step: 5, requirement: 8 }],
  [
    'preWarnings.additionalLabelInstructions',
    { label: 'הוראות נוספות לפי תווית התכשיר', step: 5, requirement: 8 },
  ],
  ['preWarnings.labelReference', { label: 'אסמכתת תווית התכשיר', step: 5, requirement: 8 }],
  [
    'preWarnings.acknowledgedByExterminator',
    { label: 'אישור המדביר לאזהרות לפני ההדברה', step: 5, requirement: 8 },
  ],
  [
    'preWarnings.coveredApplicationKeys',
    { label: 'התכשירים שהאזהרות מתייחסות אליהם', step: 5, requirement: 8 },
  ],
  [
    'preWarnings.strictestAppliedAcrossAll',
    { label: 'החלת ההנחיה המחמירה ביותר על כל התכשירים', step: 5, requirement: 8 },
  ],
  ['preWarnings', { label: 'אזהרות ומידע לפני ההדברה', step: 5, requirement: 8 }],

  // ── דרישה 13 ──
  ['postWarnings.duringTreatmentInfo', { label: 'אזהרות ומידע במהלך ההדברה', step: 5, requirement: 13 }],
  ['postWarnings.afterTreatmentInfo', { label: 'אזהרות ומידע בסיום ההדברה', step: 5, requirement: 13 }],
  ['postWarnings.followUpRequired', { label: 'האם נדרש טיפול משלים', step: 5, requirement: 13 }],
  ['postWarnings.followUpDescription', { label: 'תיאור הטיפול המשלים', step: 5, requirement: 13 }],
  [
    'postWarnings.acknowledgedByExterminator',
    { label: 'אישור המדביר לאזהרות בסיום ההדברה', step: 5, requirement: 13 },
  ],
  ['postWarnings', { label: 'אזהרות ומידע בסיום ההדברה', step: 5, requirement: 13 }],

  // ── דרישה 9 ──
  ['assistants.*.fullName', { label: 'שם המדביר המסייע', step: 6, requirement: 9 }],
  ['assistants.*.licenseType', { label: 'סוג רישיון המדביר המסייע', step: 6, requirement: 9 }],
  ['assistants.*.licenseNumber', { label: 'מספר רישיון המדביר המסייע', step: 6, requirement: 9 }],
  ['assistants.*.phone', { label: 'טלפון המדביר המסייע', step: 6, requirement: 9 }],
  ['assistants.*.email', { label: 'דוא״ל המדביר המסייע', step: 6, requirement: 9 }],
  ['assistants.*.address', { label: 'כתובת המדביר המסייע', step: 6, requirement: 9 }],
  ['assistants.*.instructionsGiven', { label: 'תיעוד שניתנו הנחיות למדביר המסייע', step: 6, requirement: 9 }],
  ['assistants.*.receivedLogCopy', { label: 'האם המדביר המסייע קיבל עותק מהיומן', step: 6, requirement: 9 }],
  ['assistants.*.signature', { label: 'חתימת המדביר המסייע', step: 6, requirement: 15 }],
  ['assistants', { label: 'מדביר מסייע', step: 6, requirement: 9 }],

  // ── דרישה 14 ──
  ['handover.delivered', { label: 'אישור מסירת היומן למזמין', step: 6, requirement: 14 }],
  ['handover.method', { label: 'דרך המסירה', step: 6, requirement: 14 }],
  ['handover.methodOther', { label: 'פירוט דרך המסירה', step: 6, requirement: 14 }],
  ['handover.recipientName', { label: 'שם האדם שקיבל את היומן', step: 6, requirement: 14 }],
  ['handover.deliveredAt', { label: 'מועד מסירת היומן', step: 6, requirement: 14 }],
  ['handover', { label: 'מסירת היומן למזמין', step: 6, requirement: 14 }],

  // ── דרישה 15 ──
  ['signatures.exterminator', { label: 'חתימת המדביר', step: 6, requirement: 15 }],
  ['signatures.recipient', { label: 'חתימת האדם שקיבל את היומן', step: 6, requirement: 15 }],
  ['signatures', { label: 'חתימות', step: 6, requirement: 15 }],

  // ── כללי ──
  ['treatmentKinds', { label: 'סוג ההדברה', step: 2, requirement: 4 }],
  ['baitStations', { label: 'תחנות האכלה', step: 4, requirement: 12 }],
  ['monitoring.findings.*.pestSubtype', { label: 'פירוט המזיק (נספח א׳)', step: 3, requirement: 6 }],
  ['postWarnings.treatmentPerformedDescription', { label: 'טיב ההדברה שבוצעה בפועל', step: 5, requirement: 13 }],
  ['warranty.period', { label: 'תקופת האחריות', step: 5, requirement: 14 }],
  ['warranty.notes', { label: 'תנאי האחריות', step: 5, requirement: 14 }],
  ['attachments', { label: 'קבצים מצורפים', step: 4, requirement: 6 }],
];

/** ממיר נתיב Zod (מערך) למחרוזת נקודתית. */
export function pathToString(path: ReadonlyArray<string | number>): string {
  return path.map((p) => String(p)).join('.');
}

/** מנרמל אינדקסים מספריים ל-`*` לצורך התאמה לתבנית. */
function normalizePath(path: string): string {
  return path
    .split('.')
    .map((seg) => (/^\d+$/.test(seg) ? '*' : seg))
    .join('.');
}

const DEFAULT_META: FieldMeta = { label: 'שדה ביומן', step: 1, requirement: 0 };

/** מחזיר את המידע על שדה לפי נתיב, כולל נפילה חזרה לאב הקרוב. */
export function lookupField(path: string): FieldMeta {
  const normalized = normalizePath(path);
  for (const [pattern, meta] of PATTERNS) {
    if (normalized === pattern) return meta;
  }
  // נפילה חזרה: חיפוש התאמת תחילית מהארוכה לקצרה.
  const segments = normalized.split('.');
  for (let i = segments.length - 1; i > 0; i -= 1) {
    const prefix = segments.slice(0, i).join('.');
    for (const [pattern, meta] of PATTERNS) {
      if (prefix === pattern) return meta;
    }
  }
  return DEFAULT_META;
}

/** מזהה ה-DOM שמשמש לקפיצה לשדה מתוך רשימת השגיאות. */
export function fieldDomId(path: string): string {
  return `field-${path.replace(/[^A-Za-z0-9]+/g, '-')}`;
}

/** האינדקס האנושי (1-מבוסס) של פריט במערך, להצגה: "מזיק 2". */
export function humanIndexFromPath(path: string): number | undefined {
  const match = path.match(/\.(\d+)(?:\.|$)/);
  if (!match?.[1]) return undefined;
  return Number(match[1]) + 1;
}
