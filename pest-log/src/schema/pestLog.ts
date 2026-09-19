import { z } from 'zod';
import {
  assistantExterminatorSchema,
  attachmentSchema,
  baitStationSchema,
  executionTimeSchema,
  exterminatorSchema,
  foggingSchema,
  fumigationSchema,
  handoverSchema,
  locationSchema,
  monitoringSchema,
  operatorSchema,
  ordererSchema,
  pesticideApplicationSchema,
  postTreatmentWarningsSchema,
  preTreatmentWarningsSchema,
  preventionSchema,
  signaturesSchema,
} from './sections';
import { logStatusSchema, treatmentKindSchema } from './enums';
import { isoTimestamp, optionalText, uuid } from './primitives';
import { fieldDomId, humanIndexFromPath, lookupField, pathToString, type WizardStepIndex } from './fieldRegistry';

/** מרווח סבילות לשעון המכשיר מול שעון השרת (דקות). */
export const CLOCK_TOLERANCE_MINUTES = 10;

/** גוף היומן — כל התוכן שנדרש בהוראת הרשם. */
const basePestLogContent = z.object({
  /** סוגי ההדברה שבוצעו. מכתיב שדות חובה נוספים. */
  treatmentKinds: z.array(treatmentKindSchema).min(1, 'סוג ההדברה — יש לבחור לפחות סוג אחד'),

  exterminator: exterminatorSchema, // דרישה 1
  operator: operatorSchema, // דרישה 2
  orderer: ordererSchema, // דרישה 3
  location: locationSchema, // דרישה 4
  execution: executionTimeSchema, // דרישה 5
  monitoring: monitoringSchema, // דרישה 6
  prevention: preventionSchema, // דרישה 7
  preWarnings: preTreatmentWarningsSchema, // דרישה 8

  /** דרישה 9 — מדביר מסייע. ריק כאשר לא היה מדביר מסייע. */
  assistants: z.array(assistantExterminatorSchema).default([]),
  /** האם עבד מדביר מסייע. כאשר true — נדרש לפחות מדביר מסייע אחד. */
  hasAssistant: z.boolean(),

  /** דרישה 10 — איוד. נדרש כאשר treatmentKinds מכיל 'fumigation'. */
  fumigation: fumigationSchema.optional(),
  /** דרישה 11 — ערפול. נדרש כאשר treatmentKinds מכיל 'fogging'. */
  fogging: foggingSchema.optional(),

  /** דרישה 12 — תכשירים ויישומים. */
  applications: z.array(pesticideApplicationSchema).min(1, 'תכשירים ויישומים — יש להוסיף לפחות יישום אחד'),

  postWarnings: postTreatmentWarningsSchema, // דרישה 13
  handover: handoverSchema, // דרישה 14
  signatures: signaturesSchema, // דרישה 15

  /** פונקציות קיימות שנשמרות. */
  baitStations: z.array(baitStationSchema).default([]),
  attachments: z.array(attachmentSchema).default([]),
  generalNotes: optionalText('הערות כלליות ליומן', 4000),
});

export type PestLogContentInput = z.input<typeof basePestLogContent>;

export interface CompletionContext {
  /** זמן השרת. נדרש כדי לפסול תאריך ביצוע עתידי גם אם שעון המכשיר מוטה. */
  serverNow: Date;
}

/**
 * הסכימה המלאה להשלמת יומן, כולל כל הכללים המותנים.
 * אותה סכימה משמשת את הטופס, השרת, ההשלמה וה-PDF.
 */
export function makePestLogContentSchema(context: CompletionContext) {
  return basePestLogContent.superRefine((value, ctx) => {
    const kinds = new Set(value.treatmentKinds);

    /* ── דרישה 10: איוד ── */
    if (kinds.has('fumigation') && !value.fumigation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fumigation'],
        message: 'תיעוד איוד — חובה כאשר סוג ההדברה כולל איוד: יש לתעד את פעולות האיטום שבוצעו לפני האיוד',
      });
    }

    /* ── דרישה 11: ערפול ── */
    if (kinds.has('fogging')) {
      if (!value.fogging) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fogging'],
          message: 'תיעוד ערפול — חובה כאשר סוג ההדברה כולל ערפול: יש לתעד אם ניתנה לציבור התראה מראש',
        });
      }
      if (value.location.placeKind !== 'fogging_area') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['location', 'placeKind'],
          message: 'בערפול — יש לבחור מקום מסוג "ערפול (שכונה)" ולציין את שם השכונה',
        });
      }
    }

    /* ── דרישה 4: מספר דירה נדרש כאשר מדובר בדירה ── */
    if (value.location.placeKind === 'dwelling') {
      const isApartment = /דירה/.test(value.location.structureType);
      if (isApartment && !value.location.apartmentNumber) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['location', 'apartmentNumber'],
          message: 'מספר דירה — חובה כאשר סוג המבנה הוא דירה',
        });
      }
    }

    /* ── דרישה 5: תאריך ושעת ביצוע בפועל, לפי שעון השרת ── */
    const performedAt = new Date(
      `${value.execution.performedDate}T${value.execution.performedStartTime}:00`,
    );
    if (!Number.isNaN(performedAt.getTime())) {
      const toleranceMs = CLOCK_TOLERANCE_MINUTES * 60 * 1000;
      if (performedAt.getTime() > context.serverNow.getTime() + toleranceMs) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['execution', 'performedDate'],
          message: 'תאריך ושעת ביצוע ההדברה — לא ניתן לדווח על ביצוע במועד עתידי',
        });
      }
    }
    if (value.execution.performedEndTime) {
      if (value.execution.performedEndTime < value.execution.performedStartTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['execution', 'performedEndTime'],
          message: 'שעת סיום ההדברה — לא יכולה להיות לפני שעת התחילה',
        });
      }
    }

    /* ── דרישה 9: מדביר מסייע ── */
    if (value.hasAssistant && value.assistants.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assistants'],
        message: 'מדביר מסייע — סומן שעבד מדביר מסייע, יש למלא את פרטיו ואת חתימתו',
      });
    }
    if (!value.hasAssistant && value.assistants.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['hasAssistant'],
        message: 'מדביר מסייע — הוזנו פרטי מדביר מסייע, יש לסמן שעבד מדביר מסייע',
      });
    }

    /* ── דרישה 8: האזהרות חייבות לכסות את כל התכשירים ── */
    const applicationKeys = value.applications.map((a) => a.key);
    const covered = new Set(value.preWarnings.coveredApplicationKeys);
    const uncovered = applicationKeys.filter((k) => !covered.has(k));
    if (uncovered.length > 0 && !value.preWarnings.strictestAppliedAcrossAll) {
      const names = uncovered
        .map((k) => value.applications.find((a) => a.key === k)?.productTradeName ?? k)
        .join(', ');
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['preWarnings', 'coveredApplicationKeys'],
        message: `אזהרות לפני ההדברה — האזהרות אינן מתייחסות לכל התכשירים (חסרים: ${names}). יש להתייחס לכולם או לסמן שהוחלה ההנחיה המחמירה ביותר.`,
      });
    }

    /* ── דרישה 12: מזיק שנגדו מיושם תכשיר צריך להופיע גם בממצאי הניטור ── */
    const monitoredPests = new Set(value.monitoring.findings.map((f) => f.pestName));
    value.applications.forEach((application, index) => {
      if (!monitoredPests.has(application.targetPestName)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['applications', index, 'targetPestName'],
          message: `שם המזיק (ביישום התכשיר) — "${application.targetPestName}" אינו מופיע בממצאי הניטור. יש להוסיף אותו לממצאים או לתקן את השם.`,
        });
      }
    });

    /* ── דרישה 15: חתימת מקבל היומן ושם המקבל חייבים להתאים ── */
    if (
      value.signatures.recipient.signerName &&
      value.handover.recipientName &&
      value.signatures.recipient.signerName !== value.handover.recipientName
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['signatures', 'recipient', 'signerName'],
        message: 'חתימת מקבל היומן — שם החותם שונה משם האדם שקיבל את היומן',
      });
    }

    /* ── תכשיר שאינו רשום או שלא אומת — חוסם השלמה ── */
    value.applications.forEach((application, index) => {
      const status = application.productSnapshot?.registrationStatus;
      if (status === 'revoked' || status === 'expired') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['applications', index, 'productTradeName'],
          message: `התכשיר "${application.productTradeName}" מסומן במאגר כ-${status === 'revoked' ? 'בוטל' : 'תוקף פג'} — לא ניתן להשלים יומן עם תכשיר שאינו בתוקף.`,
        });
      }
    });
  });
}

export type PestLogContent = z.infer<ReturnType<typeof makePestLogContentSchema>>;

/* ───────────────────────── מסמך היומן ───────────────────────── */

/** מטא-נתונים של רשומת היומן (נשמרים בעמודות נפרדות במסד). */
export const pestLogRecordSchema = z.object({
  id: uuid,
  organizationId: uuid,
  /** מספר סידורי עוקב ובלתי חוזר ברמת העסק. מוקצה רק בהשלמה. */
  serialNumber: z.number().int().positive().nullable(),
  status: logStatusSchema,
  /** גרסת מסמך. עולה בכל תיקון. */
  documentVersion: z.number().int().positive(),
  /** hash של המסמך הסופי (SHA-256 של ה-snapshot הקנוני). */
  documentHash: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  completedAt: isoTimestamp('זמן השלמת היומן').nullable(),
  cancellationReason: z.string().nullable(),
  /** יומן מקור, כאשר זו גרסת תיקון. */
  correctsLogId: uuid.nullable(),
  correctionReason: z.string().nullable(),
  createdAt: isoTimestamp('נוצר בתאריך'),
  updatedAt: isoTimestamp('עודכן בתאריך'),
  createdBy: uuid.nullable(),
  updatedBy: uuid.nullable(),
  /** נעילה אופטימיסטית. */
  version: z.number().int().nonnegative(),
});
export type PestLogRecord = z.infer<typeof pestLogRecordSchema>;

/* ───────────────────────── שגיאות ורשימת שדות חסרים ───────────────────────── */

export interface ValidationProblem {
  /** נתיב נקודתי, למשל applications.0.batchNumber */
  path: string;
  /** תווית השדה בעברית. */
  label: string;
  /** הודעת השגיאה בעברית. */
  message: string;
  /** השלב בטופס — לצורך קפיצה לשדה. */
  step: WizardStepIndex;
  /** סעיף הדרישה. */
  requirement: number;
  /** מזהה DOM לקפיצה. */
  domId: string;
  /** אינדקס אנושי בתוך מערך, אם רלוונטי. */
  itemIndex?: number;
}

export type CompletionValidationResult =
  | { ok: true; data: PestLogContent }
  | { ok: false; problems: ValidationProblem[] };

/** ממיר שגיאות Zod לרשימת בעיות בעברית, ממוינת לפי שלב. */
export function toProblems(error: z.ZodError): ValidationProblem[] {
  const seen = new Set<string>();
  const problems: ValidationProblem[] = [];
  for (const issue of error.issues) {
    const path = pathToString(issue.path);
    const key = `${path}::${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const meta = lookupField(path);
    const itemIndex = humanIndexFromPath(path);
    problems.push({
      path,
      label: meta.label,
      message: issue.message,
      step: meta.step,
      requirement: meta.requirement,
      domId: fieldDomId(path),
      ...(itemIndex === undefined ? {} : { itemIndex }),
    });
  }
  return problems.sort((a, b) => a.step - b.step || a.path.localeCompare(b.path, 'he'));
}

/**
 * ולידציה מלאה להשלמת יומן. מחזירה או את הנתונים המנורמלים,
 * או רשימת שדות חסרים/שגויים בעברית עם קישור לשלב ולשדה.
 */
export function validateForCompletion(
  content: unknown,
  context: CompletionContext,
): CompletionValidationResult {
  const parsed = makePestLogContentSchema(context).safeParse(content);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, problems: toProblems(parsed.error) };
}

/** מקבץ בעיות לפי שלב, להצגה בסרגל השגיאות. */
export function groupProblemsByStep(problems: ValidationProblem[]): Map<WizardStepIndex, ValidationProblem[]> {
  const map = new Map<WizardStepIndex, ValidationProblem[]>();
  for (const problem of problems) {
    const list = map.get(problem.step);
    if (list) list.push(problem);
    else map.set(problem.step, [problem]);
  }
  return map;
}

/* ───────────────────────── טיוטה ───────────────────────── */

/**
 * טיוטה נשמרת כ-JSON חופשי: היא ניתנת לעריכה ואינה חייבת להיות שלמה.
 * הוולידציה המלאה מתבצעת רק בהשלמה.
 */
export const draftEnvelopeSchema = z.object({
  id: uuid,
  organizationId: uuid,
  /** תוכן חלקי. לא נאכף כאן במכוון. */
  content: z.record(z.unknown()),
  /** מזהה ייחודי למניעת כפילויות בסנכרון. */
  idempotencyKey: z.string().min(8),
  version: z.number().int().nonnegative(),
  updatedAt: isoTimestamp('עודכן בתאריך'),
});
export type DraftEnvelope = z.infer<typeof draftEnvelopeSchema>;

/** תוכן ריק לטיוטה חדשה. */
export function emptyDraftContent(): Record<string, unknown> {
  return {
    treatmentKinds: ['standard'],
    hasAssistant: false,
    assistants: [],
    applications: [],
    baitStations: [],
    attachments: [],
    monitoring: { findings: [] },
    prevention: { actions: [] },
    operator: { hasOperator: false },
    execution: { timeZone: 'Asia/Jerusalem' },
  };
}
