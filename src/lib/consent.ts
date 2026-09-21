/**
 * Cookie and tracking consent.
 *
 * Shared by the client provider, the banner, the settings panel and the server
 * action that records the choice — so there is exactly one definition of what
 * the categories are and what "consented" means.
 *
 * ## The rule the code enforces
 *
 * Nothing in the analytics or marketing categories runs before the visitor has
 * made a choice. Not "runs in a degraded mode", not "runs but anonymised" —
 * does not run. `hasDecided()` is false until the visitor picks, and every
 * consumer checks it.
 *
 * ## The rule the code cannot enforce
 *
 * Whether a given cookie *needs* consent under Israeli law, and whether the
 * "necessary" classification below is correct for each one, is a legal
 * question. The classification here is the engineering team's reading and is
 * flagged for review in docs/MANUAL-REVIEW-REQUIRED.md.
 */

export const CONSENT_COOKIE = "tn_consent";

/**
 * Bumped when the *categories* change or a new processor is added — not for
 * copy edits. A bump invalidates stored choices and re-asks, because consent
 * to the old set is not consent to the new one.
 */
export const CONSENT_VERSION = 1;

/** One year. Long enough not to nag, short enough to be a real re-ask. */
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type ConsentCategory = "necessary" | "functional" | "analytics" | "marketing";

/** The three categories a visitor can actually decide about. */
export const OPTIONAL_CATEGORIES = ["functional", "analytics", "marketing"] as const;
export type OptionalCategory = (typeof OPTIONAL_CATEGORIES)[number];

export interface ConsentChoice {
  version: number;
  /** ISO timestamp of the decision. Stored so a record can be produced later. */
  decidedAt: string;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
}

/**
 * Before any choice is made.
 *
 * Everything optional is off. This is the state the site runs in for a first
 * visit, and the site must be fully usable in it — browsing, cart, checkout
 * and the room designer all work with nothing but the necessary cookies.
 */
export const DENIED_ALL: ConsentChoice = {
  version: CONSENT_VERSION,
  decidedAt: "",
  functional: false,
  analytics: false,
  marketing: false,
};

export function allowAll(now: Date = new Date()): ConsentChoice {
  return {
    version: CONSENT_VERSION,
    decidedAt: now.toISOString(),
    functional: true,
    analytics: true,
    marketing: true,
  };
}

export function rejectOptional(now: Date = new Date()): ConsentChoice {
  return { ...DENIED_ALL, decidedAt: now.toISOString() };
}

/** A decision has been recorded (as opposed to "defaults are in force"). */
export function hasDecided(choice: ConsentChoice): boolean {
  return choice.decidedAt !== "" && choice.version === CONSENT_VERSION;
}

/**
 * Parses the cookie.
 *
 * Anything malformed, truncated or from an older version resolves to
 * `DENIED_ALL` — the safe direction. A corrupted cookie must never read as
 * consent.
 */
export function parseConsent(raw: string | undefined | null): ConsentChoice {
  if (!raw) return DENIED_ALL;
  try {
    /*
     * Tolerates both forms. `next/headers` decodes on read, so a server-side
     * read arrives as plain JSON; a raw `document.cookie` read arrives
     * percent-encoded. `decodeURIComponent` is a no-op on the former.
     */
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    if (typeof parsed !== "object" || parsed === null) return DENIED_ALL;
    const value = parsed as Record<string, unknown>;
    if (value.version !== CONSENT_VERSION) return DENIED_ALL;
    if (typeof value.decidedAt !== "string" || !value.decidedAt) return DENIED_ALL;
    return {
      version: CONSENT_VERSION,
      decidedAt: value.decidedAt,
      functional: value.functional === true,
      analytics: value.analytics === true,
      marketing: value.marketing === true,
    };
  } catch {
    return DENIED_ALL;
  }
}

/**
 * The cookie's value, **unencoded**.
 *
 * Percent-encoding is the caller's job, and the reason is a bug this used to
 * have: `cookies().set()` from `next/headers` encodes the value it is given,
 * while a raw `document.cookie` write does not. Encoding here meant the server
 * wrote a double-encoded cookie, which `parseConsent` then decoded once into
 * `%7B%22version%22…` — not JSON, so it resolved to "no decision" and the
 * visitor was asked again on the very next page load, their recorded choice
 * silently ignored.
 *
 * So: this returns plain JSON. The client encodes when it writes through
 * `document.cookie`; the server hands it to `cookies().set()` untouched and
 * lets Next encode it once.
 */
export function serialiseConsent(choice: ConsentChoice): string {
  return JSON.stringify(choice);
}

export interface CategoryDescription {
  key: ConsentCategory;
  title: string;
  body: string;
  /** What actually runs in this category today. */
  items: string[];
  /** `necessary` cannot be switched off. */
  locked?: boolean;
}

/**
 * What the visitor is actually being asked about.
 *
 * Written from the site as it is, not from a template: the functional row
 * names the real cookies, and the analytics and marketing rows say plainly
 * that nothing is wired up yet. Listing vendors that are not present would be
 * its own kind of misleading.
 */
export const CONSENT_CATEGORIES: CategoryDescription[] = [
  {
    key: "necessary",
    title: "חיוניים",
    body: "נדרשים כדי שהאתר יעבוד. בלעדיהם אי אפשר להחזיק סל קניות, להישאר מחוברים או לשלוח טופס בבטחה. הם אינם משמשים למעקב ואי אפשר לכבות אותם.",
    items: [
      "tn_cart — מזהה סל הקניות שלכם.",
      "tn_session — שמירת התחברות לחשבון.",
      "tn_guest — מזהה אנונימי שמאפשר לכם לחזור לעיצוב ששמרתם בלי להירשם.",
      "tn_consent — הבחירה שלכם בדף הזה.",
    ],
    locked: true,
  },
  {
    key: "functional",
    title: "פונקציונליים",
    body: "זוכרים העדפות תצוגה כדי לחסוך לכם הגדרה חוזרת. האתר עובד במלואו גם בלעדיהם.",
    items: [
      "זכירת יחידת מידה ואחוז עודפים במחשבון הכמויות.",
      "זכירת מצב תצוגה ברשימת המוצרים.",
    ],
  },
  {
    key: "analytics",
    title: "אנליטיקה",
    body: "מדידת שימוש מצטברת שעוזרת לנו להבין מה עובד ומה לא. לא מופעלת עד שתאשרו.",
    items: [
      "כרגע לא מופעל אצלנו ספק אנליטיקה כלשהו. אם נחבר אחד, נעדכן את הדף הזה ונבקש את הסכמתכם מחדש.",
    ],
  },
  {
    key: "marketing",
    title: "שיווק ופרסום",
    body: "פיקסלים ומזהי פרסום של צד שלישי. לא מופעלים עד שתאשרו.",
    items: [
      "כרגע אין באתר פיקסל פרסומי, רימרקטינג או מזהה מפרסם.",
    ],
  },
];

/**
 * The exact wording shown beside a marketing opt-in.
 *
 * Lives here rather than in the server action because a `"use server"` module
 * may only export async functions, and both the footer form and the checkout
 * form need to render this string.
 *
 * Stored with every marketing consent: "they ticked a box" is not a record —
 * what they were told when they ticked it is. Editing this string does not
 * rewrite the copies already stored against past consents, which is the point.
 */
export const MARKETING_CONSENT_TEXT =
  "אני מאשר/ת קבלת דיוור שיווקי בדוא״ל על מוצרים, מבצעים ותכני עיצוב. אפשר להסיר את ההסכמה בכל עת בקישור שבתחתית כל הודעה.";
