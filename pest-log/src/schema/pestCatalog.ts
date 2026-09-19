import { z } from 'zod';
import { isoTimestamp, optionalText, requiredText, uuid } from './primitives';

/**
 * קטלוג המזיקים — נספח א׳ להוראות הרשם.
 *
 * ⚠ חשוב: המערכת אינה מגיעה עם רשימת מזיקים "רשמית" מוטבעת בקוד.
 * נוסח נספח א׳ מופיע במסמך הרשם, והמערכת טוענת אותו דרך import מבוקר
 * (CSV מאומת) כך שלכל שורה נשמר מקור המידע ותאריך האימות.
 * ראו docs/legal-compliance-2026.md §6 ו-scripts/import-pest-catalog.mjs.
 */
export const pestCatalogEntrySchema = z.object({
  id: uuid.optional(),
  /** קוד/מזהה הפריט בנספח א׳ כפי שהופיע במקור. */
  code: requiredText('קוד המזיק', 60),
  /** שם המזיק בעברית. */
  nameHe: requiredText('שם המזיק', 200),
  /** שם לטיני/מדעי, אם הופיע במקור. */
  nameScientific: optionalText('שם מדעי', 200),
  /** קבוצה/מדור בנספח א׳, כפי שהופיע במקור. */
  groupName: optionalText('קבוצת המזיק', 200),
  /** מקור המידע: שם המסמך/קובץ שממנו נטען הפריט. */
  sourceName: requiredText('מקור המידע', 300),
  /** קישור למקור, אם קיים. */
  sourceUrl: optionalText('קישור למקור', 1000),
  /** מתי אומת מול המקור. */
  verifiedAt: isoTimestamp('תאריך אימות'),
  isActive: z.boolean().default(true),
});
export type PestCatalogEntry = z.infer<typeof pestCatalogEntrySchema>;

/** שורת CSV לייבוא קטלוג המזיקים. */
export const pestCatalogCsvRowSchema = z.object({
  code: z.string().min(1),
  name_he: z.string().min(1),
  name_scientific: z.string().optional().default(''),
  group_name: z.string().optional().default(''),
  source_name: z.string().min(1),
  source_url: z.string().optional().default(''),
  verified_at: z.string().min(1),
});
