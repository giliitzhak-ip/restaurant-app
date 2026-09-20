import { z } from 'zod';
import {
  coordinatesSchema,
  emailAddress,
  isoDate,
  isoTimestamp,
  israeliMobile,
  israeliPhone,
  licenseNumber,
  optionalText,
  percentage,
  positiveNumber,
  requiredLongText,
  requiredText,
  signatureValueSchema,
  timeOfDay,
  uuid,
} from './primitives';
import {
  handoverMethodSchema,
  infestationLevelSchema,
  mixtureKindSchema,
  placeKindSchema,
  preventionStatusSchema,
  quantityBasisSchema,
  treatmentKindSchema,
} from './enums';

/* ───────────────────────── דרישה 1: פרטי המדביר ───────────────────────── */

export const exterminatorSchema = z.object({
  fullName: requiredText('שם המדביר המלא', 200),
  licenseType: requiredText('סוג רישיון המדביר', 120),
  licenseNumber: licenseNumber('מספר רישיון המדביר'),
  mobile: israeliMobile('טלפון נייד של המדביר'),
  email: emailAddress('דוא״ל המדביר'),
  address: requiredText('כתובת המדביר', 300),
  /** קישור לרישיון שנשמר במערכת, אם נבחר מתוך הרישיונות של העסק. */
  licenseId: uuid.optional(),
});
export type Exterminator = z.infer<typeof exterminatorSchema>;

/* ────────────────── דרישה 2: פרטי מפעיל המדביר (אם קיים) ────────────────── */

export const operatorSchema = z.discriminatedUnion('hasOperator', [
  z.object({ hasOperator: z.literal(false) }),
  z.object({
    hasOperator: z.literal(true),
    name: requiredText('שם מפעיל המדביר', 200),
    phone: israeliPhone('טלפון מפעיל המדביר'),
    email: emailAddress('דוא״ל מפעיל המדביר'),
    address: requiredText('כתובת מפעיל המדביר', 300),
  }),
]);
export type Operator = z.infer<typeof operatorSchema>;

/* ─────────────────── דרישה 3: פרטי מזמין ההדברה ─────────────────── */

/**
 * מזמין ההדברה. כאשר המזמין הוא אדם פרטי — מספר הנייד הוא חובה
 * (בנוסף למספר הטלפון), לפי דרישה 3.
 */
export const ordererSchema = z
  .object({
    name: requiredText('שם מזמין ההדברה', 200),
    phone: israeliPhone('טלפון מזמין ההדברה'),
    isPrivatePerson: z.boolean(),
    mobile: z.string().optional(),
    role: requiredText('תפקיד מזמין ההדברה', 150),
    clientId: uuid.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.isPrivatePerson) {
      const parsed = israeliMobile('טלפון נייד של מזמין ההדברה').safeParse(value.mobile ?? '');
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['mobile'],
          message:
            value.mobile && value.mobile.trim().length > 0
              ? 'טלפון נייד של מזמין ההדברה — מספר לא תקין'
              : 'טלפון נייד של מזמין ההדברה — חובה כאשר המזמין הוא אדם פרטי',
        });
      }
    } else if (value.mobile && value.mobile.trim().length > 0) {
      const parsed = israeliMobile('טלפון נייד של מזמין ההדברה').safeParse(value.mobile);
      if (!parsed.success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mobile'], message: 'טלפון נייד של מזמין ההדברה — מספר לא תקין' });
      }
    }
  });
export type Orderer = z.infer<typeof ordererSchema>;

/* ─────────────────── דרישה 4: מקום ההדברה ─────────────────── */

const dwellingLocationSchema = z.object({
  placeKind: z.literal('dwelling'),
  city: requiredText('עיר', 120),
  street: requiredText('רחוב', 150),
  houseNumber: requiredText('מספר בית', 20),
  /** מספר דירה — חובה כאשר סוג המבנה הוא דירה; נבדק ב-superRefine של היומן. */
  apartmentNumber: optionalText('מספר דירה', 20),
  structureType: requiredText('סוג המבנה', 120),
  coordinates: coordinatesSchema.optional(),
  siteId: uuid.optional(),
  notes: optionalText('הערות למקום', 1000),
});

const openAreaLocationSchema = z.object({
  placeKind: z.literal('open_area'),
  localAuthorityName: requiredText('שם הרשות המקומית', 150),
  siteType: requiredText('סוג האתר', 150),
  siteDescription: requiredLongText('תיאור האתר', 2000),
  coordinates: coordinatesSchema,
  siteId: uuid.optional(),
  notes: optionalText('הערות למקום', 1000),
});

const foggingAreaLocationSchema = z.object({
  placeKind: z.literal('fogging_area'),
  neighborhoodName: requiredText('שם השכונה', 150),
  city: requiredText('עיר', 120),
  localAuthorityName: requiredText('שם הרשות המקומית', 150),
  areaDescription: requiredLongText('תיאור השטח המערופל', 2000),
  coordinates: coordinatesSchema,
  siteId: uuid.optional(),
  notes: optionalText('הערות למקום', 1000),
});

export const locationSchema = z.discriminatedUnion('placeKind', [
  dwellingLocationSchema,
  openAreaLocationSchema,
  foggingAreaLocationSchema,
]);
export type PestLogLocation = z.infer<typeof locationSchema>;
export { dwellingLocationSchema, openAreaLocationSchema, foggingAreaLocationSchema };

/* ───────── דרישה 5: תאריך ושעת ביצוע ההדברה בפועל ───────── */

export const executionTimeSchema = z.object({
  performedDate: isoDate('תאריך ביצוע ההדברה'),
  performedStartTime: timeOfDay('שעת תחילת ההדברה'),
  performedEndTime: timeOfDay('שעת סיום ההדברה').optional(),
  /** אזור הזמן שבו נרשמו התאריך והשעה, לשחזור מדויק ב-PDF. */
  timeZone: z.string().min(1).default('Asia/Jerusalem'),
});
export type ExecutionTime = z.infer<typeof executionTimeSchema>;

/* ───────── דרישה 6: ממצאי ניטור ───────── */

export const pestFindingSchema = z.object({
  id: uuid.optional(),
  /** שם המזיק. נבחר מקטלוג המזיקים (נספח א׳) או מוזן חופשי. */
  pestName: requiredText('שם המזיק', 200),
  /** קוד המזיק בקטלוג, אם נבחר מתוך הקטלוג. */
  pestCatalogCode: optionalText('קוד המזיק בקטלוג', 60),
  /**
   * פירוט נוסף שנדרש לחלק מהמזיקים בנספח א׳ — למשל קרציות קשות מול
   * רכות, יתושים בוגרים מול זחלים, טרמיטי קרקע מול טרמיטי עץ.
   */
  pestSubtype: optionalText('פירוט המזיק', 200),
  /** פעולות הזיהוי שבוצעו. */
  identificationActions: requiredLongText('פעולות הזיהוי', 2000),
  /** דרגת התפתחות (למשל: ביצים, נימפה, בוגר). */
  developmentStage: requiredText('דרגת התפתחות', 200),
  /** סימני נגיעות שנמצאו. */
  infestationSigns: requiredLongText('סימני נגיעות', 2000),
  /** מיקום הממצא. */
  findingLocation: requiredText('מיקום הממצא', 300),
  /** רמת נגיעות: נמוכה / בינונית / גבוהה. */
  infestationLevel: infestationLevelSchema,
  notes: optionalText('הערות לממצא', 1000),
});
export type PestFinding = z.infer<typeof pestFindingSchema>;

export const monitoringSchema = z.object({
  findings: z.array(pestFindingSchema).min(1, 'ממצאי ניטור — יש להוסיף לפחות מזיק אחד שנמצא או שנבדק'),
  generalNotes: optionalText('הערות כלליות לניטור', 2000),
});
export type Monitoring = z.infer<typeof monitoringSchema>;

/* ───────── דרישה 7: פעולות מניעה וטיפול ───────── */

export const preventionActionSchema = z.object({
  id: uuid.optional(),
  description: requiredText('תיאור פעולת המניעה', 500),
  status: preventionStatusSchema,
  notes: optionalText('הערות לפעולת המניעה', 1000),
});
export type PreventionAction = z.infer<typeof preventionActionSchema>;

export const preventionSchema = z.object({
  actions: z
    .array(preventionActionSchema)
    .min(1, 'פעולות מניעה וטיפול — יש לתעד לפחות פעולה אחת שנבדקה, הומלצה או בוצעה'),
  /** הנסיבות שבגללן הוחלט לבצע הדברה ולא טיפול אחר. */
  circumstancesForChoosingPestControl: requiredLongText(
    'הנסיבות שבגללן הוחלט לבצע הדברה ולא טיפול אחר',
    3000,
  ),
});
export type Prevention = z.infer<typeof preventionSchema>;

/* ───────── דרישה 8 + 13: אזהרות ומידע ───────── */

/**
 * אזהרות ומידע לפני ההדברה (דרישה 8).
 * כלל קשה: אין מילוי אוטומטי. אם הטקסט הגיע מתבנית — חייב אישור מפורש של
 * המדביר (`acknowledgedByExterminator`) ותיעוד התבנית ומועד האישור.
 */
export const preTreatmentWarningsSchema = z.object({
  /** תיאור מפורט של טיב ההדברה. */
  treatmentNatureDescription: requiredLongText('תיאור טיב ההדברה', 4000),
  /** סיכונים לאדם. */
  risksToHumans: requiredLongText('סיכונים לאדם', 4000),
  /** סיכונים לבעלי חיים. */
  risksToAnimals: requiredLongText('סיכונים לבעלי חיים', 4000),
  /** זמן כניסה מחדש, בשעות. מבוסס על תווית התכשיר בלבד. */
  reEntryHours: positiveNumber('זמן כניסה מחדש (שעות)', 10_000),
  reEntryNotes: optionalText('הערות לזמן הכניסה מחדש', 2000),
  /** הוראות נוספות לפי תווית התכשיר. */
  additionalLabelInstructions: requiredLongText('הוראות נוספות לפי תווית התכשיר', 4000),
  /**
   * מזהי התכשירים שהאזהרות מתייחסות אליהם.
   * אם לא כל התכשירים מכוסים — חייב `strictestAppliedAcrossAll = true`.
   */
  coveredApplicationKeys: z.array(z.string().min(1)).default([]),
  /** הוחלה ההנחיה המחמירה ביותר על כל התכשירים. */
  strictestAppliedAcrossAll: z.boolean().default(false),
  /** אישור מפורש של המדביר לתוכן האזהרות. */
  acknowledgedByExterminator: z.literal(true, {
    errorMap: () => ({ message: 'אזהרות לפני ההדברה — על המדביר לאשר במפורש את תוכן האזהרות' }),
  }),
  acknowledgedAt: isoTimestamp('מועד אישור האזהרות'),
  /** התבנית שממנה הוצע הטקסט, אם הייתה. התבנית היא הצעה בלבד. */
  sourceTemplateId: uuid.optional(),
  /** התווית שעליה מבוססות האזהרות — חובה כדי לאשר טקסט מתבנית. */
  labelReference: requiredText('אסמכתת תווית התכשיר', 500),
});
export type PreTreatmentWarnings = z.infer<typeof preTreatmentWarningsSchema>;

/** אזהרות ומידע במהלך ההדברה ובסיומה (דרישה 13). */
export const postTreatmentWarningsSchema = z
  .object({
    duringTreatmentInfo: requiredLongText('אזהרות ומידע במהלך ההדברה', 4000),
    /** טיב ההדברה שבוצעה בפועל (היה בגרסה הקודמת; אינו שדה חובה). */
    treatmentPerformedDescription: optionalText('טיב ההדברה שבוצעה בפועל', 4000),
    afterTreatmentInfo: requiredLongText('אזהרות ומידע בסיום ההדברה', 4000),
    /** האם נדרש טיפול משלים. */
    followUpRequired: z.boolean(),
    followUpDescription: optionalText('תיאור הטיפול המשלים', 2000),
    followUpTargetDate: isoDate('מועד מתוכנן לטיפול משלים').optional(),
    acknowledgedByExterminator: z.literal(true, {
      errorMap: () => ({ message: 'אזהרות בסיום ההדברה — על המדביר לאשר במפורש את תוכן האזהרות' }),
    }),
    acknowledgedAt: isoTimestamp('מועד אישור האזהרות בסיום'),
  })
  .superRefine((value, ctx) => {
    if (value.followUpRequired && !value.followUpDescription) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['followUpDescription'],
        message: 'תיאור הטיפול המשלים — חובה כאשר נדרש טיפול משלים',
      });
    }
  });
export type PostTreatmentWarnings = z.infer<typeof postTreatmentWarningsSchema>;

/* ───────── דרישה 9: מדביר מסייע ───────── */

export const assistantExterminatorSchema = z.object({
  id: uuid.optional(),
  fullName: requiredText('שם המדביר המסייע', 200),
  licenseType: requiredText('סוג רישיון המדביר המסייע', 120),
  licenseNumber: licenseNumber('מספר רישיון המדביר המסייע'),
  phone: israeliPhone('טלפון המדביר המסייע'),
  email: emailAddress('דוא״ל המדביר המסייע'),
  address: requiredText('כתובת המדביר המסייע', 300),
  /** האם ניתנו לו הנחיות. */
  instructionsGiven: z.literal(true, {
    errorMap: () => ({ message: 'מדביר מסייע — יש לתעד שניתנו לו הנחיות' }),
  }),
  instructionsDetails: optionalText('פירוט ההנחיות שניתנו למדביר המסייע', 2000),
  /** האם קיבל עותק מהיומן. */
  receivedLogCopy: z.boolean(),
  receivedLogCopyAt: isoTimestamp('מועד קבלת עותק היומן').optional(),
  /** חתימת המדביר המסייע (דרישה 15). */
  signature: signatureValueSchema,
});
export type AssistantExterminator = z.infer<typeof assistantExterminatorSchema>;

/* ───────── דרישה 10: איוד ───────── */

export const fumigationSealingActionSchema = z.object({
  id: uuid.optional(),
  description: requiredText('תיאור פעולת האיטום', 500),
  locationDescription: requiredText('מיקום האיטום', 300),
  performedAt: isoTimestamp('מועד ביצוע האיטום'),
  materialUsed: optionalText('חומר האיטום', 200),
});
export type FumigationSealingAction = z.infer<typeof fumigationSealingActionSchema>;

export const fumigationSchema = z.object({
  /** תיעוד פעולות האיטום שבוצעו לפני האיוד. */
  sealingActions: z
    .array(fumigationSealingActionSchema)
    .min(1, 'איוד — יש לתעד לפחות פעולת איטום אחת שבוצעה לפני האיוד'),
  sealingCompletedAt: isoTimestamp('מועד סיום פעולות האיטום'),
  notes: optionalText('הערות לאיוד', 2000),
});
export type Fumigation = z.infer<typeof fumigationSchema>;

/* ───────── דרישה 11: ערפול ───────── */

export const foggingSchema = z
  .object({
    /** האם ניתנה לציבור התראה מראש. */
    publicWarningGiven: z.boolean(),
    publicWarningMethod: optionalText('אופן ההתראה לציבור', 500),
    publicWarningAt: isoTimestamp('מועד ההתראה לציבור').optional(),
    publicWarningNotGivenReason: optionalText('הסיבה לאי-מתן התראה לציבור', 1000),
    notes: optionalText('הערות לערפול', 2000),
  })
  .superRefine((value, ctx) => {
    if (value.publicWarningGiven) {
      if (!value.publicWarningMethod) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['publicWarningMethod'],
          message: 'אופן ההתראה לציבור — חובה כאשר ניתנה התראה מראש',
        });
      }
      if (!value.publicWarningAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['publicWarningAt'],
          message: 'מועד ההתראה לציבור — חובה כאשר ניתנה התראה מראש',
        });
      }
    } else if (!value.publicWarningNotGivenReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['publicWarningNotGivenReason'],
        message: 'הסיבה לאי-מתן התראה לציבור — חובה כאשר לא ניתנה התראה מראש',
      });
    }
  });
export type Fogging = z.infer<typeof foggingSchema>;

/* ───────── דרישה 12: תכשירים ויישומים ───────── */

/**
 * יישום תכשיר. כל השדות בדרישה 12 הם חובה.
 *
 * תכשיר מוכן לשימוש (`readyToUse = true`): שדה ריכוז החומר הפעיל בתכשיר
 * המוכן לשימוש אינו נדרש בקלט — הוא נגזר אוטומטית מריכוז החומר הפעיל
 * בתכשיר (שהם זהים בתכשיר מוכן לשימוש), ומסומן ב-`readyToUseConcentrationDerived`.
 * זהו השדה היחיד שמותר לדלג עליו.
 * ⚠ נדרש אימות מול נוסח הוראת הרשם — ראו docs/legal-compliance-2026.md §12.
 */
export const pesticideApplicationSchema = z
  .object({
    id: uuid.optional(),
    /** מפתח יציב בתוך היומן, לקישור האזהרות ליישום. */
    key: z.string().min(1),
    /** שם המזיק שנגדו מיושם התכשיר. */
    targetPestName: requiredText('שם המזיק (ביישום התכשיר)', 200),
    /** השם המסחרי של התכשיר. */
    productTradeName: requiredText('השם המסחרי של התכשיר', 250),
    /** מספר אצווה או סדרת ייצור. */
    batchNumber: requiredText('מספר אצווה / סדרת ייצור', 120),
    /** שם החומר הפעיל. */
    activeIngredientName: requiredText('שם החומר הפעיל', 250),
    /** ריכוז החומר הפעיל בתכשיר, באחוזים. */
    activeIngredientConcentrationPercent: percentage('ריכוז החומר הפעיל בתכשיר (%)'),
    /** מינון. */
    dosage: positiveNumber('מינון', 1_000_000),
    /** יחידת המידה של המינון. */
    dosageUnit: requiredText('יחידת המידה של המינון', 60),
    /** סוג הכמות: תמיסה / תערובת / מלכודות. */
    mixtureKind: mixtureKindSchema,
    /** כמות התמיסה/תערובת/מלכודות. */
    mixtureQuantity: positiveNumber('כמות תמיסה / תערובת / מלכודות', 1_000_000),
    /** יחידת הכמות. */
    mixtureUnit: requiredText('יחידת הכמות', 60),
    /** הבסיס: ליחידת אורך / שטח / נפח / יחידה. */
    quantityBasis: quantityBasisSchema,
    /** גודל הבסיס (למשל 120 מ״ר). */
    basisAmount: positiveNumber('גודל השטח / האורך / הנפח', 10_000_000),
    /** יחידת הבסיס. */
    basisUnit: requiredText('יחידת השטח / האורך / הנפח', 60),
    /** האם התכשיר מוכן לשימוש. */
    readyToUse: z.boolean(),
    /** ריכוז החומר הפעיל בתכשיר המוכן לשימוש, באחוזים. */
    readyToUseConcentrationPercent: z.union([z.number(), z.string()]).optional(),
    /** סומן כאשר הערך נגזר אוטומטית בשל תכשיר מוכן לשימוש. */
    readyToUseConcentrationDerived: z.boolean().default(false),
    /** שיטת היישום. */
    applicationMethod: requiredText('שיטת היישום', 200),
    /** קישור לתכשיר במאגר, אם נבחר ממנו. */
    productId: uuid.optional(),
    /** תמונת מצב של נתוני המאגר בזמן השימוש — כדי שהיומן לא ישתנה בדיעבד. */
    productSnapshot: z
      .object({
        registrationStatus: z.string().optional(),
        registrationNumber: z.string().optional(),
        labelUrl: z.string().optional(),
        sourceName: z.string().optional(),
        verifiedAt: z.string().optional(),
      })
      .optional(),
    notes: optionalText('הערות ליישום', 2000),
  })
  .superRefine((value, ctx) => {
    const raw = value.readyToUseConcentrationPercent;
    const provided = !(raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === ''));

    if (provided) {
      const parsed = percentage('ריכוז החומר הפעיל בתכשיר המוכן לשימוש (%)').safeParse(raw);
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['readyToUseConcentrationPercent'],
          message: 'ריכוז החומר הפעיל בתכשיר המוכן לשימוש (%) — יש להזין אחוז בין 0 ל-100',
        });
      }
      return;
    }

    // לא הוזן: מותר לדלג רק בתכשיר מוכן לשימוש, ואז הערך נגזר.
    if (!value.readyToUse) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['readyToUseConcentrationPercent'],
        message:
          'ריכוז החומר הפעיל בתכשיר המוכן לשימוש (%) — שדה חובה. ניתן לדלג עליו רק בתכשיר מוכן לשימוש.',
      });
    }
  })
  .transform((value) => {
    const raw = value.readyToUseConcentrationPercent;
    const provided = !(raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === ''));
    if (provided) {
      return {
        ...value,
        readyToUseConcentrationPercent: percentage('ריכוז החומר הפעיל בתכשיר המוכן לשימוש (%)').parse(raw),
        readyToUseConcentrationDerived: false,
      };
    }
    // תכשיר מוכן לשימוש: הריכוז במוכן לשימוש זהה לריכוז בתכשיר.
    return {
      ...value,
      readyToUseConcentrationPercent: value.activeIngredientConcentrationPercent,
      readyToUseConcentrationDerived: true,
    };
  });
export type PesticideApplication = z.infer<typeof pesticideApplicationSchema>;

/* ───────── דרישה 14: מסירת היומן ───────── */

export const handoverSchema = z
  .object({
    /** אישור שהיומן נמסר או הושאר אצל מזמין ההדברה. */
    delivered: z.literal(true, {
      errorMap: () => ({
        message: 'מסירת היומן — יש לאשר שהיומן נמסר או הושאר אצל מזמין ההדברה',
      }),
    }),
    method: handoverMethodSchema,
    methodOther: optionalText('פירוט דרך המסירה', 300),
    /** שם האדם שקיבל את היומן. */
    recipientName: requiredText('שם האדם שקיבל את היומן', 200),
    recipientRole: optionalText('תפקיד מקבל היומן', 150),
    /** מועד המסירה. */
    deliveredAt: isoTimestamp('מועד מסירת היומן'),
    notes: optionalText('הערות למסירה', 1000),
  })
  .superRefine((value, ctx) => {
    if (value.method === 'other' && !value.methodOther) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['methodOther'],
        message: 'פירוט דרך המסירה — חובה כאשר נבחר "אחר"',
      });
    }
  });
export type Handover = z.infer<typeof handoverSchema>;

/* ───────── דרישה 15: חתימות ───────── */

export const signaturesSchema = z.object({
  /** חתימת המדביר. */
  exterminator: signatureValueSchema,
  /** חתימת האדם שקיבל את היומן. */
  recipient: signatureValueSchema,
  // חתימת המדביר המסייע נשמרת בתוך רשומת המדביר המסייע (דרישה 9).
});
export type Signatures = z.infer<typeof signaturesSchema>;

/* ───────── תחנות האכלה (פונקציה קיימת שנשמרת) ───────── */

export const baitStationSchema = z.object({
  id: uuid.optional(),
  stationNumber: requiredText('מספר תחנה', 40),
  /** סוג התחנה — תחנת האכלה עם/בלי רעל, מלכודת הדבקה, ניטור וכד׳. */
  stationType: z
    .enum(['bait_poison', 'bait_monitor', 'glue_trap', 'insect_monitor', 'moth_trap', 'fly_trap', 'other'])
    .optional(),
  /** מזהה התחנה במאגר התחנות של האתר, כשהיא נבדקה מתוך המאגר. */
  siteStationId: uuid.optional(),
  locationDescription: requiredText('מיקום התחנה', 300),
  status: z.enum(['intact', 'consumed', 'damaged', 'missing', 'replaced', 'new']),
  consumptionLevel: z.enum(['none', 'partial', 'full']).optional(),
  productTradeName: optionalText('תכשיר בתחנה', 250),
  notes: optionalText('הערות לתחנה', 1000),
  coordinates: coordinatesSchema.optional(),
});
export type BaitStation = z.infer<typeof baitStationSchema>;

export const BAIT_STATION_STATUS_LABELS: Record<z.infer<typeof baitStationSchema>['status'], string> = {
  intact: 'שלמה',
  consumed: 'נאכלה',
  damaged: 'ניזוקה',
  missing: 'חסרה',
  replaced: 'הוחלפה',
  new: 'חדשה',
};

/* ───────── קבצים מצורפים (תמונות) ───────── */

export const attachmentSchema = z.object({
  id: uuid.optional(),
  kind: z.enum(['photo', 'document', 'pdf', 'signature']),
  /** נתיב באחסון הפרטי. שם הקובץ אקראי — ראו docs/security-and-retention.md. */
  storagePath: z.string().min(1).optional(),
  fileName: optionalText('שם הקובץ', 300),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  caption: optionalText('כותרת לתמונה', 300),
  /** סיווג התמונה: מפגע, פעולת מניעה או תיעוד כללי. */
  photoKind: z.enum(['hazard', 'prevention', 'general']).optional(),
  capturedAt: isoTimestamp('מועד צילום').optional(),
  coordinates: coordinatesSchema.optional(),
  /** מזהה מקומי ב-IndexedDB לפני העלאה. */
  localBlobId: z.string().optional(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, 'טביעת אצבע של הקובץ לא תקינה').optional(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

/* ───────── אחריות (פונקציה קיימת שנשמרת מהגרסה הקודמת) ───────── */

export const SITE_STATION_TYPE_LABELS = {
  bait_poison: 'תחנת האכלה עם רעל',
  bait_monitor: 'תחנת האכלה ללא רעל (ניטור)',
  glue_trap: 'מלכודת הדבקה',
  insect_monitor: 'מלכודת ניטור חרקים',
  moth_trap: 'מלכודת עש',
  fly_trap: 'מלכודת זבובים',
  other: 'אחר',
} as const;

export type SiteStationType = keyof typeof SITE_STATION_TYPE_LABELS;

/** צבע לכל סוג תחנה. הצבע מלווה תמיד בשם הסוג ובמספר התחנה. */
export const SITE_STATION_TYPE_COLORS: Record<SiteStationType, string> = {
  bait_poison: '#d9822b',
  bait_monitor: '#3f9d5a',
  glue_trap: '#7a5a44',
  insect_monitor: '#2e9fbf',
  moth_trap: '#8a8f98',
  fly_trap: '#6b54c9',
  other: '#5d6f63',
};

/**
 * אחריות על הטיפול.
 * אינה חלק מהדרישות המחייבות ביומן, ולכן היא אופציונלית — אך כשהיא
 * מולאה היא נשמרת ומודפסת ב-PDF, בדיוק כפי שהיה בגרסה הקודמת.
 */
export const warrantySchema = z.object({
  period: optionalText('תקופת האחריות', 60),
  notes: optionalText('תנאי האחריות והערות', 3000),
});
export type Warranty = z.infer<typeof warrantySchema>;

export { treatmentKindSchema, placeKindSchema };
