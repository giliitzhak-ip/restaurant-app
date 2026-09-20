import { z } from 'zod';

/**
 * מסלול עבודה — טיפוסים, תוויות ואילוצים.
 * הקובץ הזה הוא מקור האמת היחיד גם לטופס, גם לשמירה וגם לדוח, בדיוק
 * כמו סכמת היומן. אין כאן נתוני דמה ואין ערכי ברירת מחדל שממציאים מידע.
 */

export const ROUTE_KINDS = ['daily', 'weekly', 'maintenance_line', 'one_off', 'team', 'area'] as const;
export type RouteKind = (typeof ROUTE_KINDS)[number];

export const ROUTE_KIND_LABELS: Record<RouteKind, string> = {
  daily: 'מסלול יומי',
  weekly: 'מסלול שבועי',
  maintenance_line: 'קו אחזקה קבוע',
  one_off: 'מסלול חד-פעמי',
  team: 'מסלול לפי עובד או צוות',
  area: 'מסלול לפי אזור',
};

export const ROUTE_STATUSES = ['planned', 'active', 'completed', 'cancelled'] as const;
export type RouteStatus = (typeof ROUTE_STATUSES)[number];

export const ROUTE_STATUS_LABELS: Record<RouteStatus, string> = {
  planned: 'מתוכנן',
  active: 'פעיל',
  completed: 'הושלם',
  cancelled: 'בוטל',
};

export const VISIT_STATUSES = [
  'pending',
  'en_route',
  'in_progress',
  'completed',
  'revisit_needed',
  'waiting_client',
  'postponed',
  'cancelled',
] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

/**
 * תווית, גוון ואייקון לכל סטטוס.
 * הצבע לעולם אינו לבדו: לכל סטטוס יש גם טקסט וגם אייקון, כדי שהמסך
 * יהיה קריא גם לכבדי ראייה וגם בשמש.
 */
export interface VisitStatusPresentation {
  label: string;
  /** שם הגוון בעיצוב (ראו theme.css) */
  tone: 'grey' | 'blue' | 'orange' | 'green' | 'red' | 'purple' | 'yellow';
  /** שם אייקון מ-lucide-react */
  icon: 'circle' | 'navigation' | 'wrench' | 'check' | 'rotate' | 'clock' | 'calendar' | 'ban';
}

export const VISIT_STATUS_PRESENTATION: Record<VisitStatus, VisitStatusPresentation> = {
  pending: { label: 'טרם התחיל', tone: 'grey', icon: 'circle' },
  en_route: { label: 'בדרך', tone: 'blue', icon: 'navigation' },
  in_progress: { label: 'בטיפול', tone: 'orange', icon: 'wrench' },
  completed: { label: 'הושלם', tone: 'green', icon: 'check' },
  revisit_needed: { label: 'נדרש ביקור חוזר', tone: 'purple', icon: 'rotate' },
  waiting_client: { label: 'ממתין ללקוח', tone: 'yellow', icon: 'clock' },
  postponed: { label: 'נדחה', tone: 'yellow', icon: 'calendar' },
  cancelled: { label: 'בוטל', tone: 'grey', icon: 'ban' },
};

export const VISIT_PRIORITIES = ['normal', 'high', 'urgent'] as const;
export type VisitPriority = (typeof VISIT_PRIORITIES)[number];

export const VISIT_PRIORITY_LABELS: Record<VisitPriority, string> = {
  normal: 'רגילה',
  high: 'גבוהה',
  urgent: 'דחופה',
};

export const FOCUS_CATEGORIES = [
  'pest',
  'hotspot',
  'bait_station',
  'previous_defect',
  'prevention',
  'complaint',
  'photo',
  'equipment',
  'access',
  'hours',
  'sensitivity',
  'note',
] as const;
export type FocusCategory = (typeof FOCUS_CATEGORIES)[number];

export const FOCUS_CATEGORY_LABELS: Record<FocusCategory, string> = {
  pest: 'מזיק לבדיקה',
  hotspot: 'מוקד קבוע לבדיקה',
  bait_station: 'תחנת האכלה',
  previous_defect: 'ליקוי מהטיפול הקודם',
  prevention: 'פעולת מניעה שהומלצה',
  complaint: 'תלונת לקוח',
  photo: 'צילום לפני ואחרי',
  equipment: 'ציוד או תכשיר להביא',
  access: 'מגבלת כניסה',
  hours: 'שעות ביצוע אפשריות',
  sensitivity: 'רגישות במקום',
  note: 'הערה',
};

export const FOCUS_STATUSES = ['to_check', 'in_progress', 'done', 'not_found', 'needs_revisit'] as const;
export type FocusStatus = (typeof FOCUS_STATUSES)[number];

export const FOCUS_STATUS_LABELS: Record<FocusStatus, string> = {
  to_check: 'לבדיקה',
  in_progress: 'בטיפול',
  done: 'בוצע',
  not_found: 'לא נמצא',
  needs_revisit: 'דורש ביקור נוסף',
};

export const FOCUS_IMPORTANCES = ['low', 'normal', 'high'] as const;
export type FocusImportance = (typeof FOCUS_IMPORTANCES)[number];

export const FOCUS_IMPORTANCE_LABELS: Record<FocusImportance, string> = {
  low: 'נמוכה',
  normal: 'רגילה',
  high: 'גבוהה',
};

export const FOCUS_SOURCES = ['manual', 'auto_suggested', 'template'] as const;
export type FocusSource = (typeof FOCUS_SOURCES)[number];

export const FOCUS_SOURCE_LABELS: Record<FocusSource, string> = {
  manual: 'נוסף ידנית',
  auto_suggested: 'הצעה מהמערכת',
  template: 'דגש קבוע מהתבנית',
};

/* ── סכמות ולידציה ───────────────────────────────────────────────────────── */

const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'שעה בפורמט HH:MM')
  .optional()
  .or(z.literal('').transform(() => undefined));

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך בפורמט YYYY-MM-DD');

export const routeFormSchema = z
  .object({
    name: z.string().trim().min(2, 'שם המסלול חייב לכלול לפחות שני תווים'),
    routeKind: z.enum(ROUTE_KINDS),
    areaName: z.string().trim().optional(),
    routeDate: dateString,
    startTime: timeString,
    assignedUserId: z.string().uuid().optional().nullable(),
    teamName: z.string().trim().optional(),
    vehicle: z.string().trim().optional(),
    startPointAddress: z.string().trim().optional(),
    notes: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.routeKind === 'area' && !value.areaName?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['areaName'], message: 'במסלול לפי אזור יש לציין את שם האזור' });
    }
    if (value.routeKind === 'team' && !value.teamName?.trim() && !value.assignedUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['teamName'],
        message: 'במסלול לפי עובד או צוות יש לבחור עובד או לציין שם צוות',
      });
    }
  });

export type RouteFormValues = z.infer<typeof routeFormSchema>;

export const visitFormSchema = z
  .object({
    clientId: z.string().uuid('יש לבחור לקוח'),
    clientSiteId: z.string().uuid().optional().nullable(),
    plannedStartTime: timeString,
    timeWindowStart: timeString,
    timeWindowEnd: timeString,
    estimatedDurationMinutes: z
      .number({ invalid_type_error: 'משך משוער בדקות' })
      .int()
      .min(1)
      .max(600)
      .optional(),
    serviceType: z.string().trim().optional(),
    frequencyDays: z.number().int().min(1).max(3650).optional(),
    priority: z.enum(VISIT_PRIORITIES).default('normal'),
    internalNotes: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.timeWindowStart && value.timeWindowEnd && value.timeWindowEnd <= value.timeWindowStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['timeWindowEnd'],
        message: 'סוף חלון הזמן חייב להיות אחרי תחילתו',
      });
    }
  });

export type VisitFormValues = z.infer<typeof visitFormSchema>;

/** רשימת הבדיקה שמוצגת בסיום ביקור. הסימון הוא של המדביר בלבד. */
export const VISIT_COMPLETION_CHECKLIST = [
  { key: 'focusReviewed', label: 'כל הדגשים נבדקו' },
  { key: 'logOpened', label: 'נפתח יומן הדברה כאשר היה צורך' },
  { key: 'findingsAdded', label: 'נוספו ממצאים' },
  { key: 'photosTaken', label: 'צולמו תמונות' },
  { key: 'baitStationsUpdated', label: 'תחנות ההאכלה עודכנו' },
  { key: 'followUpTask', label: 'נדרשת משימת המשך' },
  { key: 'revisitNeeded', label: 'נדרש ביקור נוסף' },
  { key: 'logHandedOver', label: 'הלקוח קיבל את היומן' },
] as const;

export type VisitChecklistKey = (typeof VISIT_COMPLETION_CHECKLIST)[number]['key'];
