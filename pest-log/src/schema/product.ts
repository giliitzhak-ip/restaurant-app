import { z } from 'zod';
import { isoDate, isoTimestamp, optionalText, percentage, requiredText, uuid } from './primitives';
import { productRegistrationStatusSchema, type ProductRegistrationStatus } from './enums';

/**
 * מאגר התכשירים.
 *
 * ⚠ אין להסתמך על רשימה מוטבעת בקוד כמידע עדכני. לכל תכשיר נשמרים מקור
 * המידע, תאריך האימות, סטטוס הרישום והתוקף — והממשק מציג אזהרה כאשר
 * התכשיר אינו בתוקף או שלא אומת לאחרונה.
 */
export const productSchema = z.object({
  id: uuid.optional(),
  tradeName: requiredText('השם המסחרי של התכשיר', 250),
  activeIngredientName: requiredText('שם החומר הפעיל', 250),
  activeIngredientConcentrationPercent: percentage('ריכוז החומר הפעיל בתכשיר (%)'),
  /** האם התכשיר מסופק מוכן לשימוש. */
  readyToUse: z.boolean().default(false),
  /** סטטוס הרישום. */
  registrationStatus: productRegistrationStatusSchema,
  /** מספר רישום, אם קיים. */
  registrationNumber: optionalText('מספר רישום', 100),
  /** קישור לתווית התכשיר. */
  labelUrl: optionalText('קישור לתווית', 1000),
  /** תוקף הרישום. */
  validUntil: isoDate('תוקף הרישום').optional(),
  /** מזיקים מורשים לפי התווית. */
  approvedPests: z.array(z.string().min(1)).default([]),
  /** שיטות יישום מותרות לפי התווית. */
  approvedApplicationMethods: z.array(z.string().min(1)).default([]),
  /** מקור המידע. */
  sourceName: requiredText('מקור המידע', 300),
  sourceUrl: optionalText('קישור למקור', 1000),
  /** מתי אומת מול המקור. */
  verifiedAt: isoTimestamp('תאריך אימות'),
  isActive: z.boolean().default(true),
  notes: optionalText('הערות', 2000),
});
export type Product = z.infer<typeof productSchema>;

/** כמה ימים אחרי האימות התכשיר נחשב "לא אומת לאחרונה". */
export const PRODUCT_VERIFICATION_STALE_DAYS = 180;

export interface ProductWarning {
  severity: 'warning' | 'blocking';
  message: string;
}

/**
 * מחזיר אזהרות לתכשיר: תוקף, סטטוס רישום ואימות מיושן.
 * `blocking` חוסם השלמת יומן; `warning` מוצג אך אינו חוסם.
 */
export interface ProductWarningInput {
  tradeName: string;
  registrationStatus: ProductRegistrationStatus;
  /** null כאשר אין תאריך תוקף רשום. */
  validUntil?: string | null;
  verifiedAt: string;
  isActive: boolean;
}

export function productWarnings(product: ProductWarningInput, now: Date): ProductWarning[] {
  const warnings: ProductWarning[] = [];

  if (product.registrationStatus === 'revoked') {
    warnings.push({ severity: 'blocking', message: `רישום התכשיר "${product.tradeName}" בוטל — לא ניתן להשתמש בו ביומן.` });
  }
  if (product.registrationStatus === 'expired') {
    warnings.push({ severity: 'blocking', message: `תוקף רישום התכשיר "${product.tradeName}" פג — לא ניתן להשתמש בו ביומן.` });
  }
  if (product.registrationStatus === 'unknown') {
    warnings.push({
      severity: 'warning',
      message: `סטטוס הרישום של "${product.tradeName}" לא אומת. יש לאמת מול התווית ומול המקור הרשמי לפני השימוש.`,
    });
  }
  if (!product.isActive) {
    warnings.push({ severity: 'warning', message: `התכשיר "${product.tradeName}" סומן כלא פעיל במאגר.` });
  }
  if (product.validUntil) {
    const until = new Date(`${product.validUntil}T23:59:59Z`);
    if (until.getTime() < now.getTime()) {
      warnings.push({ severity: 'blocking', message: `תוקף התכשיר "${product.tradeName}" הסתיים בתאריך ${product.validUntil}.` });
    }
  }
  const verified = Date.parse(product.verifiedAt);
  if (!Number.isNaN(verified)) {
    const ageDays = (now.getTime() - verified) / (24 * 60 * 60 * 1000);
    if (ageDays > PRODUCT_VERIFICATION_STALE_DAYS) {
      warnings.push({
        severity: 'warning',
        message: `התכשיר "${product.tradeName}" לא אומת מול המקור הרשמי ${Math.floor(ageDays)} ימים. יש לאמת מחדש.`,
      });
    }
  }
  return warnings;
}

/** שורת CSV לייבוא מאגר התכשירים ממקור מאומת. */
export const productCsvRowSchema = z.object({
  trade_name: z.string().min(1),
  active_ingredient_name: z.string().min(1),
  active_ingredient_concentration_percent: z.string().min(1),
  ready_to_use: z.string().optional().default('false'),
  registration_status: z.string().min(1),
  registration_number: z.string().optional().default(''),
  label_url: z.string().optional().default(''),
  valid_until: z.string().optional().default(''),
  approved_pests: z.string().optional().default(''),
  approved_application_methods: z.string().optional().default(''),
  source_name: z.string().min(1),
  source_url: z.string().optional().default(''),
  verified_at: z.string().min(1),
});
