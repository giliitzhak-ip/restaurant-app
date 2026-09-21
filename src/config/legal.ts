/**
 * Legal and business facts.
 *
 * Every statement the site makes about *who is selling* — the company behind
 * it, where a cancellation notice goes, who handles an accessibility
 * complaint, which processor sees customer data — resolves through this file.
 *
 * Why one file: these facts appear in the terms, the privacy policy, the
 * accessibility statement, the cancellation form, the order confirmation and
 * the footer. Scattered across nine pages they drift, and a site that states
 * two different company IDs is worse than one that states none.
 *
 * ## Placeholders
 *
 * Most of these facts are not knowable from the codebase. A company ID, a
 * registered address, whether a privacy officer is required — those come from
 * the business, not from the developer. Inventing them would be worse than
 * leaving them empty: a wrong company ID on a terms page is a false statement
 * to consumers.
 *
 * So an unknown fact is `null`, and the UI renders an explicit
 * "not yet supplied" marker rather than an empty string or a broken sentence.
 * `legalPlaceholders()` lists everything still outstanding;
 * `assertLegalFactsForProduction()` turns that list into a loud production
 * warning. See docs/LEGAL-PLACEHOLDERS.md.
 *
 * ## What this file is not
 *
 * It is not legal advice, and the drafts that read from it have not been
 * reviewed by a lawyer. Every page built on it is marked
 * "טיוטה לבדיקת יועץ משפטי" until someone qualified signs it off.
 */

/** Rendered wherever a fact is still missing. Never an empty string. */
export const LEGAL_PLACEHOLDER = "— טרם הושלם —" as const;

export type LegalFactKey =
  | "companyLegalName"
  | "tradingName"
  | "companyId"
  | "companyIdKind"
  | "registeredAddress"
  | "returnsAddress"
  | "phone"
  | "email"
  | "supportEmail"
  | "openingHours"
  | "supportHours"
  | "accessibilityCoordinator"
  | "accessibilityCoordinatorContact"
  | "databaseController"
  | "privacyOfficer"
  | "shippingRegions"
  | "deliveryTime"
  | "installationLeadTime"
  | "warrantyTerms"
  | "paymentProcessor"
  | "hostingProvider"
  | "analyticsProvider"
  | "emailProvider"
  | "crmProvider"
  | "physicalAccessibility";

export interface LegalFact {
  /** Hebrew label, used in the UI and in the placeholder report. */
  readonly label: string;
  /** `null` until the business supplies it. */
  readonly value: string | null;
  /** What the owner has to do, and why it matters. Shown in the report. */
  readonly note: string;
  /**
   * `launch` — the site should not take real orders without it.
   * `conditional` — required only in circumstances the code cannot determine
   * (turnover, headcount, whether the business receives the public, whether a
   * database must be registered). Absence here is never evidence of exemption.
   */
  readonly required: "launch" | "conditional";
}

/**
 * The facts.
 *
 * Values that are genuinely known from the project — the trading name, the
 * VAT treatment — are filled in. Everything else stays null on purpose.
 */
export const legalFacts: Record<LegalFactKey, LegalFact> = {
  companyLegalName: {
    label: "שם משפטי מלא של העוסק",
    value: null,
    note: "השם כפי שהוא רשום ברשם החברות או ברשות המסים. מופיע בתקנון, בהצהרת הנגישות ובאישור ההזמנה.",
    required: "launch",
  },
  tradingName: {
    label: "שם מסחרי",
    value: "טרה נובה",
    note: "שם המותג שמוצג ללקוח. כבר מוגדר ב-src/config/brand.ts.",
    required: "launch",
  },
  companyId: {
    label: "ח.פ. / ע.מ.",
    value: null,
    note: "מספר מזהה של העוסק. חובה להצגה באתר מסחר. אין להמציא מספר.",
    required: "launch",
  },
  companyIdKind: {
    label: "סוג המזהה",
    value: null,
    note: 'האם מדובר בחברה בע״מ ("ח.פ."), עוסק מורשה ("ע.מ.") או שותפות. משפיע על נוסח התקנון.',
    required: "launch",
  },
  registeredAddress: {
    label: "כתובת רשומה",
    value: null,
    note: "הכתובת הרשמית של העסק. הכתובת ב-brand.ts היא placeholder לתצוגה ואינה מאומתת.",
    required: "launch",
  },
  returnsAddress: {
    label: "כתובת למשלוח הודעת ביטול והחזרת מוצרים",
    value: null,
    note: "חוק הגנת הצרכן מחייב דרך ברורה למסירת הודעת ביטול. יכולה להיות זהה לכתובת הרשומה או שונה.",
    required: "launch",
  },
  phone: {
    label: "טלפון לשירות לקוחות",
    value: null,
    note: "המספר ב-brand.ts (03-0000000) הוא placeholder ואינו מספר אמיתי.",
    required: "launch",
  },
  email: {
    label: "דואר אלקטרוני כללי",
    value: null,
    note: "הכתובת ב-brand.ts (hello@example.com) היא placeholder.",
    required: "launch",
  },
  supportEmail: {
    label: "דואר אלקטרוני לשירות לקוחות ולביטולים",
    value: null,
    note: "היעד שאליו נשלחות בקשות ביטול ופניות שירות. יכול להיות זהה לכתובת הכללית.",
    required: "launch",
  },
  openingHours: {
    label: "שעות פעילות",
    value: null,
    note: "השעות ב-brand.ts הן דוגמה. אם קיימת קבלת קהל, יש לציין גם אותה.",
    required: "launch",
  },
  supportHours: {
    label: "שעות מענה לשירות לקוחות",
    value: null,
    note: "מוצג ליד טופס הביטול וטופס יצירת הקשר, כדי שלקוח ידע מתי לצפות למענה.",
    required: "launch",
  },
  accessibilityCoordinator: {
    label: "רכז נגישות",
    value: null,
    note: "החובה למנות רכז נגישות תלויה בסוג העסק ובמספר העובדים. אין להסיק פטור מהיעדר נתון — טעון בדיקה מול מורשה נגישות.",
    required: "conditional",
  },
  accessibilityCoordinatorContact: {
    label: "פרטי קשר לפניות נגישות",
    value: null,
    note: "טלפון, דוא״ל וכתובת לפניות בנושא נגישות. חובה בהצהרת נגישות גם כשאין חובת רכז.",
    required: "launch",
  },
  databaseController: {
    label: "בעל השליטה במאגר המידע",
    value: null,
    note: "מי נחשב בעל המאגר לפי חוק הגנת הפרטיות. טעון בדיקה משפטית, לרבות שאלת חובת רישום או הודעה על המאגר.",
    required: "conditional",
  },
  privacyOfficer: {
    label: "ממונה על הגנת הפרטיות",
    value: null,
    note: "החובה למנות ממונה לפי תיקון 13 תלויה בהיקף ובסוג המידע. אין להניח פטור — טעון בדיקה משפטית.",
    required: "conditional",
  },
  shippingRegions: {
    label: "אזורי משלוח",
    value: null,
    note: "לאילו אזורים בארץ מבוצע משלוח, והאם יש אזורים בתוספת תשלום או ללא שירות.",
    required: "launch",
  },
  deliveryTime: {
    label: "זמני אספקה",
    value: null,
    note: "טווח ימי עסקים בפועל. המספרים המוצגים כיום באתר מגיעים מנתוני המוצר ב-seed ואינם התחייבות עסקית.",
    required: "launch",
  },
  installationLeadTime: {
    label: "זמן המתנה להתקנה",
    value: null,
    note: "רלוונטי רק אם שירות ההתקנה מופעל (commerce.installationPricePerSqm).",
    required: "conditional",
  },
  warrantyTerms: {
    label: "תנאי אחריות",
    value: null,
    note: "תקופת אחריות, מה היא מכסה, מה מבטל אותה, והאם היא של היצרן או של המוכר. משתנה בין קטגוריות מוצר.",
    required: "launch",
  },
  paymentProcessor: {
    label: "ספק הסליקה",
    value: null,
    note: "שם הספק בפועל. נדרש גם למדיניות הפרטיות (העברת מידע לצד שלישי) וגם לתקנון.",
    required: "launch",
  },
  hostingProvider: {
    label: "ספק האחסון והתשתית",
    value: null,
    note: "היכן מתארחים השרתים והקבצים, ובאיזו מדינה. משפיע על סעיף העברת מידע לחו״ל.",
    required: "launch",
  },
  analyticsProvider: {
    label: "ספק אנליטיקה",
    value: null,
    note: "ברירת המחדל בקוד היא ללא אנליטיקה כלל. אם מופעל GTM או Plausible יש לציין זאת במדיניות ה-Cookie.",
    required: "conditional",
  },
  emailProvider: {
    label: "ספק דיוור",
    value: null,
    note: "מי שולח בפועל את הודעות השירות והדיוור. נדרש הסכם עיבוד מידע.",
    required: "conditional",
  },
  crmProvider: {
    label: "ספק CRM",
    value: null,
    note: "אם פניות ולקוחות מנוהלים במערכת חיצונית, היא מקבלת מידע אישי ויש לציין אותה.",
    required: "conditional",
  },
  physicalAccessibility: {
    label: "הסדרי נגישות פיזיים",
    value: null,
    note: "אם קיימת קבלת קהל — תיאור הנגישות של המקום. אם אין קבלת קהל, יש לציין זאת במפורש בהצהרה.",
    required: "conditional",
  },
};

/** The value to render, or the explicit marker. Never an empty string. */
export function legalValue(key: LegalFactKey): string {
  return legalFacts[key].value ?? LEGAL_PLACEHOLDER;
}

/** True when the fact has not been supplied. */
export function isPlaceholder(key: LegalFactKey): boolean {
  return legalFacts[key].value === null;
}

export interface LegalPlaceholderReport {
  key: LegalFactKey;
  label: string;
  note: string;
  required: LegalFact["required"];
}

/** Everything still outstanding, launch-blocking first. */
export function legalPlaceholders(): LegalPlaceholderReport[] {
  return (Object.keys(legalFacts) as LegalFactKey[])
    .filter(isPlaceholder)
    .map((key) => {
      const { label, note, required } = legalFacts[key];
      return { key, label, note, required };
    })
    .sort((a, b) => (a.required === b.required ? 0 : a.required === "launch" ? -1 : 1));
}

/**
 * Document versions.
 *
 * Bumped by hand whenever the *substance* of a policy changes, never for a
 * typo. The version is stored alongside every consent, so "which text did this
 * customer actually agree to" has an answer a year later.
 *
 * `date` is the effective date shown to the reader.
 */
export const legalDocuments = {
  terms: { version: "2026-09-draft-1", date: "ספטמבר 2026" },
  privacy: { version: "2026-09-draft-1", date: "ספטמבר 2026" },
  cookies: { version: "2026-09-draft-1", date: "ספטמבר 2026" },
  accessibility: { version: "2026-09-draft-1", date: "ספטמבר 2026" },
  shipping: { version: "2026-09-draft-1", date: "ספטמבר 2026" },
  warranty: { version: "2026-09-draft-1", date: "ספטמבר 2026" },
} as const;

export type LegalDocumentKey = keyof typeof legalDocuments;

/**
 * Shown at the top of every legal page.
 *
 * These pages were drafted by an engineer against the requirements, not by a
 * lawyer. Saying so is both honest and safer than letting a reader assume the
 * text has been cleared.
 */
export const DRAFT_NOTICE =
  "טיוטה לבדיקת יועץ משפטי. הנוסח הזה נכתב כבסיס עבודה ולא נבדק על ידי עורך דין. אין להסתמך עליו כעל ייעוץ משפטי ואין לפרסם אותו כנוסח סופי לפני אישור.";

/**
 * Accessibility statements carry a matching caveat: an automated pass is not
 * an accessibility audit, and no screen-reader testing has been recorded.
 */
export const ACCESSIBILITY_DRAFT_NOTICE =
  "האתר נבדק בכלים אוטומטיים ובניווט מקלדת. טרם בוצעה בדיקה של מורשה נגישות ובדיקה מלאה עם קורא מסך על ידי אדם. לכן אין לראות בהצהרה הזו אישור לעמידה מלאה בתקן.";

let warned = false;

/**
 * Logs the outstanding facts once, at boot, in production.
 *
 * Deliberately a warning and not a thrown error: a half-configured site that
 * refuses to boot helps nobody, and unlike a missing AUTH_SECRET a missing
 * company ID is not a security hole. It is, though, a legal exposure, so it
 * has to be impossible to miss in the deploy log.
 */
export function assertLegalFactsForProduction(
  isProduction: boolean,
  logger: (message: string) => void = console.warn,
): LegalPlaceholderReport[] {
  const outstanding = legalPlaceholders();
  if (!isProduction || warned || !outstanding.length) return outstanding;
  warned = true;

  const blocking = outstanding.filter((item) => item.required === "launch");
  const lines = outstanding
    .map((item) => `  - [${item.required}] ${item.key} — ${item.label}`)
    .join("\n");
  logger(
    `[legal] ${outstanding.length} business facts are still placeholders (${blocking.length} launch-blocking). ` +
      `Pages render "${LEGAL_PLACEHOLDER}" where they appear. See docs/LEGAL-PLACEHOLDERS.md.\n${lines}`,
  );
  return outstanding;
}
