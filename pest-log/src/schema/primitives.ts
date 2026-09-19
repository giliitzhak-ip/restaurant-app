import { z } from 'zod';
import { installHebrewErrorMap } from './hebrewErrorMap';

// כל הודעת שגיאה שאינה מוגדרת במפורש תתורגם לעברית.
installHebrewErrorMap();

/**
 * ערכים בסיסיים המשותפים לטופס, לשרת, להשלמת היומן ול-PDF.
 * כל הודעות השגיאה בעברית — הן מוצגות למשתמש כפי שהן.
 */

/** מסיר תווי כיווניות ורווחים כפולים שמגיעים מהדבקה בעברית. */
export function normalizeText(value: string): string {
  return value
    .replace(/[‎‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** מחרוזת חובה: נחתכת, ריק נחשב חסר. */
export const requiredText = (label: string, max = 500) =>
  z
    .string({ required_error: `${label} — שדה חובה`, invalid_type_error: `${label} — שדה חובה` })
    .transform(normalizeText)
    .pipe(
      z
        .string()
        .min(1, `${label} — שדה חובה`)
        .max(max, `${label} — עד ${max} תווים`),
    );

/** מחרוזת רשות: ריק הופך ל-undefined כדי לא לשמור מחרוזות ריקות במסד. */
export const optionalText = (label: string, max = 500) =>
  z
    .string()
    .transform(normalizeText)
    .refine((v) => v.length <= max, `${label} — עד ${max} תווים`)
    .transform((v) => (v.length === 0 ? undefined : v))
    .optional();

/** טקסט ארוך חובה (תיאורים, אזהרות). */
export const requiredLongText = (label: string, max = 4000) => requiredText(label, max);

const digitsOnly = (v: string) => v.replace(/[^\d]/g, '');

/**
 * טלפון נייד ישראלי: 05X-XXXXXXX (10 ספרות) או +9725XXXXXXXX.
 * נשמר מנורמל לפורמט 0XXXXXXXXX.
 */
export const israeliMobile = (label: string) =>
  z
    .string({ required_error: `${label} — שדה חובה` })
    .transform((v) => {
      const d = digitsOnly(normalizeText(v));
      if (d.startsWith('972')) return `0${d.slice(3)}`;
      return d;
    })
    .refine((d) => /^05\d{8}$/.test(d), `${label} — מספר נייד לא תקין (למשל 0501234567)`);

/**
 * טלפון ישראלי כללי: קווי (0X-XXXXXXX) או נייד, וגם מספרי 1-700/1-800.
 */
export const israeliPhone = (label: string) =>
  z
    .string({ required_error: `${label} — שדה חובה` })
    .transform((v) => {
      const d = digitsOnly(normalizeText(v));
      if (d.startsWith('972')) return `0${d.slice(3)}`;
      return d;
    })
    .refine(
      (d) => /^0[23489]\d{7}$/.test(d) || /^05\d{8}$/.test(d) || /^07\d{8}$/.test(d) || /^1[78]00\d{6}$/.test(d),
      `${label} — מספר טלפון לא תקין`,
    );

export const optionalIsraeliPhone = (label: string) =>
  z
    .string()
    .transform(normalizeText)
    .transform((v) => (v.length === 0 ? undefined : v))
    .optional()
    .superRefine((v, ctx) => {
      if (v === undefined) return;
      const parsed = israeliPhone(label).safeParse(v);
      if (!parsed.success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} — מספר טלפון לא תקין` });
      }
    })
    .transform((v) => (v === undefined ? undefined : israeliPhone(label).parse(v)));

/** דוא״ל. נשמר באותיות קטנות. */
export const emailAddress = (label: string) =>
  z
    .string({ required_error: `${label} — שדה חובה` })
    .transform((v) => normalizeText(v).toLowerCase())
    .pipe(z.string().min(1, `${label} — שדה חובה`).email(`${label} — כתובת דוא״ל לא תקינה`));

export const optionalEmailAddress = (label: string) =>
  z
    .string()
    .transform((v) => normalizeText(v).toLowerCase())
    .transform((v) => (v.length === 0 ? undefined : v))
    .optional()
    .superRefine((v, ctx) => {
      if (v === undefined) return;
      if (!z.string().email().safeParse(v).success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} — כתובת דוא״ל לא תקינה` });
      }
    });

/**
 * מספר רישיון מדביר. אורך וצורה מדויקים אינם מוגדרים כאן כדרישה רשמית —
 * נבדק רק שהוא קיים ומכיל ספרות/אותיות סבירות. ראו docs/legal-compliance-2026.md.
 */
export const licenseNumber = (label: string) =>
  z
    .string({ required_error: `${label} — שדה חובה` })
    .transform(normalizeText)
    .pipe(
      z
        .string()
        .min(2, `${label} — שדה חובה`)
        .max(40, `${label} — עד 40 תווים`)
        .regex(/^[0-9A-Za-z֐-׿/\\.\-\s]+$/u, `${label} — מכיל תווים לא חוקיים`),
    );

/** תאריך בפורמט YYYY-MM-DD. */
export const isoDate = (label: string) =>
  z
    .string({ required_error: `${label} — שדה חובה` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} — תאריך לא תקין (YYYY-MM-DD)`)
    .refine((v) => {
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }, `${label} — תאריך לא קיים בלוח השנה`);

/** שעה בפורמט HH:MM (24 שעות). */
export const timeOfDay = (label: string) =>
  z
    .string({ required_error: `${label} — שדה חובה` })
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label} — שעה לא תקינה (HH:MM)`);

/** חותמת זמן ISO 8601 (UTC או עם אזור זמן). */
export const isoTimestamp = (label: string) =>
  z
    .string({ required_error: `${label} — שדה חובה` })
    .refine((v) => !Number.isNaN(Date.parse(v)), `${label} — חותמת זמן לא תקינה`);

/** מספר חיובי (מינון, ריכוז, כמות). */
export const positiveNumber = (label: string, max = 1_000_000) =>
  z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === 'number' ? v : Number(normalizeText(v).replace(',', '.'))))
    .refine((n) => Number.isFinite(n), `${label} — יש להזין מספר`)
    .refine((n) => n > 0, `${label} — יש להזין מספר גדול מאפס`)
    .refine((n) => n <= max, `${label} — הערך גבוה מדי`);

/** מספר שאינו שלילי. */
export const nonNegativeNumber = (label: string, max = 1_000_000) =>
  z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === 'number' ? v : Number(normalizeText(v).replace(',', '.'))))
    .refine((n) => Number.isFinite(n), `${label} — יש להזין מספר`)
    .refine((n) => n >= 0, `${label} — לא ניתן להזין מספר שלילי`)
    .refine((n) => n <= max, `${label} — הערך גבוה מדי`);

/** אחוז 0–100. */
export const percentage = (label: string) =>
  positiveNumber(label, 100).refine((n) => n <= 100, `${label} — אחוז חייב להיות עד 100`);

export const uuid = z.string().uuid('מזהה לא תקין');

/** מספר חיובי שלם. */
export const positiveInt = (label: string) =>
  z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === 'number' ? v : Number(normalizeText(v))))
    .refine((n) => Number.isInteger(n) && n > 0, `${label} — יש להזין מספר שלם גדול מאפס`);

/**
 * נ״צ — קואורדינטות. תומך בשתי שיטות:
 *  - wgs84: קווי אורך/רוחב עשרוניים, מוגבל לתחום ישראל.
 *  - itm:   רשת ישראל החדשה (Israel TM Grid), מוגבל לתחום ישראל.
 */
export const ISRAEL_WGS84_BOUNDS = { latMin: 29.3, latMax: 33.5, lonMin: 34.1, lonMax: 35.95 } as const;
export const ISRAEL_ITM_BOUNDS = { eastMin: 120_000, eastMax: 310_000, northMin: 350_000, northMax: 800_000 } as const;

export const coordinatesSchema = z
  .discriminatedUnion('system', [
    z.object({
      system: z.literal('wgs84'),
      latitude: z
        .union([z.number(), z.string()])
        .transform((v) => (typeof v === 'number' ? v : Number(normalizeText(v))))
        .refine((n) => Number.isFinite(n), 'נ״צ — קו רוחב לא תקין')
        .refine(
          (n) => n >= ISRAEL_WGS84_BOUNDS.latMin && n <= ISRAEL_WGS84_BOUNDS.latMax,
          'נ״צ — קו הרוחב מחוץ לתחום ישראל',
        ),
      longitude: z
        .union([z.number(), z.string()])
        .transform((v) => (typeof v === 'number' ? v : Number(normalizeText(v))))
        .refine((n) => Number.isFinite(n), 'נ״צ — קו אורך לא תקין')
        .refine(
          (n) => n >= ISRAEL_WGS84_BOUNDS.lonMin && n <= ISRAEL_WGS84_BOUNDS.lonMax,
          'נ״צ — קו האורך מחוץ לתחום ישראל',
        ),
      accuracyMeters: nonNegativeNumber('דיוק המיקום', 100_000).optional(),
      capturedAt: isoTimestamp('זמן קליטת המיקום').optional(),
    }),
    z.object({
      system: z.literal('itm'),
      east: z
        .union([z.number(), z.string()])
        .transform((v) => (typeof v === 'number' ? v : Number(normalizeText(v))))
        .refine((n) => Number.isFinite(n), 'נ״צ — ערך מזרח לא תקין')
        .refine(
          (n) => n >= ISRAEL_ITM_BOUNDS.eastMin && n <= ISRAEL_ITM_BOUNDS.eastMax,
          'נ״צ — ערך המזרח מחוץ לרשת ישראל',
        ),
      north: z
        .union([z.number(), z.string()])
        .transform((v) => (typeof v === 'number' ? v : Number(normalizeText(v))))
        .refine((n) => Number.isFinite(n), 'נ״צ — ערך צפון לא תקין')
        .refine(
          (n) => n >= ISRAEL_ITM_BOUNDS.northMin && n <= ISRAEL_ITM_BOUNDS.northMax,
          'נ״צ — ערך הצפון מחוץ לרשת ישראל',
        ),
      accuracyMeters: nonNegativeNumber('דיוק המיקום', 100_000).optional(),
      capturedAt: isoTimestamp('זמן קליטת המיקום').optional(),
    }),
  ])
  .describe('נ״צ');

export type Coordinates = z.infer<typeof coordinatesSchema>;

/** חתימה: תמונת PNG כ-data URL, או מפתח קובץ באחסון הפרטי. */
export const signatureValueSchema = z
  .object({
    /** dataURL של PNG שנוצר ב-canvas. נשמר מקומית עד לסנכרון. */
    dataUrl: z
      .string()
      .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, 'חתימה — פורמט תמונה לא נתמך')
      .optional(),
    /** נתיב הקובץ ב-Storage הפרטי לאחר העלאה. */
    storagePath: z.string().min(1).optional(),
    signedAt: isoTimestamp('זמן החתימה'),
    signerName: requiredText('שם החותם', 200),
    /** אישור מפורש של החותם — לחיצה על "מאשר את החתימה". */
    confirmed: z.literal(true, {
      errorMap: () => ({ message: 'החתימה טרם אושרה — יש ללחוץ על אישור החתימה' }),
    }),
  })
  .refine((v) => Boolean(v.dataUrl ?? v.storagePath), { message: 'חתימה — לא נקלטה חתימה' });

export type SignatureValue = z.infer<typeof signatureValueSchema>;
