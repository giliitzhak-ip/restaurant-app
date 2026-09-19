import { z } from 'zod';

/**
 * ── רשימות ערכים ─────────────────────────────────────────────────────────────
 * חשוב: רשימות המסומנות כ-SUGGESTIONS הן הצעות לממשק בלבד ואינן רשימה סגורה
 * רשמית. במקומות שבהם הוראת הרשם אינה מגדירה רשימה סגורה, השדה נשמר כטקסט
 * חופשי עם הצעות — כדי לא להמציא סיווג רשמי שאינו קיים.
 * ראו docs/legal-compliance-2026.md.
 */

/** סוג ההדברה המבוצעת. מכתיב שדות חובה נוספים (איוד / ערפול). */
export const treatmentKindSchema = z.enum(['standard', 'fumigation', 'fogging']);
export type TreatmentKind = z.infer<typeof treatmentKindSchema>;
export const TREATMENT_KIND_LABELS: Record<TreatmentKind, string> = {
  standard: 'הדברה רגילה',
  fumigation: 'איוד',
  fogging: 'ערפול',
};

/** סוג מקום ההדברה — קובע אילו שדות מקום הם חובה (דרישה 4). */
export const placeKindSchema = z.enum(['dwelling', 'open_area', 'fogging_area']);
export type PlaceKind = z.infer<typeof placeKindSchema>;
export const PLACE_KIND_LABELS: Record<PlaceKind, string> = {
  dwelling: 'דירה / בית / מבנה',
  open_area: 'שטח פתוח',
  fogging_area: 'ערפול (שכונה)',
};

/** רמת נגיעות (דרישה 6). */
export const infestationLevelSchema = z.enum(['low', 'medium', 'high']);
export type InfestationLevel = z.infer<typeof infestationLevelSchema>;
export const INFESTATION_LEVEL_LABELS: Record<InfestationLevel, string> = {
  low: 'נמוכה',
  medium: 'בינונית',
  high: 'גבוהה',
};

/** מצב פעולת מניעה / טיפול (דרישה 7). */
export const preventionStatusSchema = z.enum(['checked', 'recommended', 'performed']);
export type PreventionStatus = z.infer<typeof preventionStatusSchema>;
export const PREVENTION_STATUS_LABELS: Record<PreventionStatus, string> = {
  checked: 'נבדקה',
  recommended: 'הומלצה',
  performed: 'בוצעה',
};

/** בסיס הכמות: ליחידת אורך / שטח / נפח (דרישה 12). */
export const quantityBasisSchema = z.enum(['length', 'area', 'volume', 'unit']);
export type QuantityBasis = z.infer<typeof quantityBasisSchema>;
export const QUANTITY_BASIS_LABELS: Record<QuantityBasis, string> = {
  length: 'ליחידת אורך',
  area: 'ליחידת שטח',
  volume: 'ליחידת נפח',
  unit: 'ליחידה / למלכודת',
};

/** סוג הכמות המיושמת. */
export const mixtureKindSchema = z.enum(['solution', 'mixture', 'traps']);
export type MixtureKind = z.infer<typeof mixtureKindSchema>;
export const MIXTURE_KIND_LABELS: Record<MixtureKind, string> = {
  solution: 'תמיסה',
  mixture: 'תערובת',
  traps: 'מלכודות',
};

/** יחידות מידה למינון. רשימה פתוחה — ניתן להוסיף ערך חופשי. */
export const DOSAGE_UNIT_SUGGESTIONS = [
  'מ״ל/ליטר',
  'גרם/ליטר',
  'מ״ל/מ״ר',
  'גרם/מ״ר',
  'מ״ל/מ״ק',
  'גרם/מ״ק',
  'ליטר/דונם',
  'ק״ג/דונם',
  'גרם/תחנה',
  'אחוז מהתמיסה',
] as const;

/** יחידות כמות תמיסה/תערובת. רשימה פתוחה. */
export const MIXTURE_UNIT_SUGGESTIONS = ['ליטר', 'מ״ל', 'ק״ג', 'גרם', 'מלכודות', 'תחנות'] as const;

/** יחידות הבסיס. רשימה פתוחה. */
export const BASIS_UNIT_SUGGESTIONS = ['מ״ר', 'מ״ק', 'מטר אורך', 'דונם', 'יחידה', 'תחנה'] as const;

/** שיטות יישום — הצעות לממשק, לא רשימה סגורה רשמית. */
export const APPLICATION_METHOD_SUGGESTIONS = [
  'ריסוס',
  'ריסוס נקודתי',
  'מִשחה / ג׳ל',
  'פיזור גרגרים',
  'אבקה',
  'עישון / איוד',
  'ערפול חם',
  'ערפול קר',
  'תחנות האכלה',
  'מלכודות דבק',
  'הזרקה',
  'מברשת / מריחה',
] as const;

/** סוגי מבנה — הצעות לממשק, לא רשימה סגורה רשמית. */
export const STRUCTURE_TYPE_SUGGESTIONS = [
  'דירה בבניין',
  'בית פרטי',
  'בניין משותף',
  'מבנה ציבורי',
  'מבנה מסחרי',
  'מוסד חינוך',
  'מוסד רפואי',
  'מטבח / מסעדה',
  'מחסן',
  'מבנה תעשייה',
  'חניון',
  'מבנה חקלאי',
] as const;

/** סוגי אתר בשטח פתוח — הצעות לממשק. */
export const OPEN_AREA_SITE_TYPE_SUGGESTIONS = [
  'גן ציבורי',
  'גן שעשועים',
  'שטח ציבורי פתוח',
  'קו ביוב / תא ביוב',
  'ערוץ נחל',
  'מזבלה / אתר פסולת',
  'שטח חקלאי',
  'חורשה',
  'חוף',
  'מאגר מים',
] as const;

/**
 * סוגי רישיון מדביר — טקסט חופשי עם הצעות.
 * אין כאן רשימה סגורה: סיווגי הרישיון נקבעים ברישיון עצמו ובהוראות הרשם,
 * והמערכת לא קובעת אותם במקום המדביר.
 */
export const LICENSE_TYPE_SUGGESTIONS = [
  'הדברה תברואית',
  'הדברת מזיקי בריאות הציבור',
  'איוד',
  'ערפול',
  'הדברת מזיקים בשטח פתוח',
] as const;

/** דרך מסירת היומן למזמין (דרישה 14). */
export const handoverMethodSchema = z.enum(['handed_in_person', 'left_at_site', 'email', 'whatsapp', 'other']);
export type HandoverMethod = z.infer<typeof handoverMethodSchema>;
export const HANDOVER_METHOD_LABELS: Record<HandoverMethod, string> = {
  handed_in_person: 'נמסר אישית',
  left_at_site: 'הושאר במקום ההדברה',
  email: 'נשלח בדוא״ל',
  whatsapp: 'נשלח בוואטסאפ',
  other: 'אחר',
};

/** סטטוס היומן. */
export const logStatusSchema = z.enum(['draft', 'completed', 'cancelled']);
export type LogStatus = z.infer<typeof logStatusSchema>;
export const LOG_STATUS_LABELS: Record<LogStatus, string> = {
  draft: 'טיוטה',
  completed: 'הושלם',
  cancelled: 'בוטל',
};

/** סטטוס רישום התכשיר במאגר. */
export const productRegistrationStatusSchema = z.enum(['registered', 'expired', 'revoked', 'unknown']);
export type ProductRegistrationStatus = z.infer<typeof productRegistrationStatusSchema>;
export const PRODUCT_REGISTRATION_STATUS_LABELS: Record<ProductRegistrationStatus, string> = {
  registered: 'רשום',
  expired: 'תוקף פג',
  revoked: 'בוטל',
  unknown: 'לא אומת',
};

/** מצב סנכרון המוצג למשתמש. */
export const syncStateSchema = z.enum(['local', 'pending', 'synced', 'error']);
export type SyncState = z.infer<typeof syncStateSchema>;
export const SYNC_STATE_LABELS: Record<SyncState, string> = {
  local: 'נשמר מקומית',
  pending: 'ממתין לסנכרון',
  synced: 'סונכרן',
  error: 'שגיאת סנכרון',
};

/** מספר המרכז הארצי להרעלות — מוצג בכל מסך ובכל PDF (דרישה 16). */
export const POISON_CENTER_PHONE = '04-7771900';
export const POISON_CENTER_NOTICE =
  'במקרה של חשד להרעלה ניתן לפנות למרכז הארצי להרעלות: 04-7771900';

/** תקופת שמירת יומן מינימלית בשנים (דרישה 17). */
export const RETENTION_YEARS = 3;
