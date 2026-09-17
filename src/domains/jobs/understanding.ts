/**
 * JobUnderstandingService (spec §32).
 *
 * Turns what the customer typed — "יש מים שיוצאים מתחת לכיור" — into a
 * structured request:
 *   { category, service, urgency, confidence }
 *
 * For the MVP this is DETERMINISTIC keyword-and-weight matching. That is a
 * deliberate choice: it is testable, explainable, offline, and instant.
 *
 * The `UnderstandingAdapter` seam exists so an AI classifier can be added
 * later without touching callers. Per spec §32, such an adapter may only
 * ever influence CLASSIFICATION. It has no path to authorization, payments,
 * permissions or job state: those are decided by RLS, the payment service and
 * the state machine, none of which consult this module.
 */

export type Urgency = 'low' | 'normal' | 'high' | 'emergency';

export interface UnderstandingResult {
  readonly category: string | null;
  readonly service: string | null;
  readonly urgency: Urgency;
  readonly confidence: number;
  /** Matched terms, so the UI can explain itself and QA can debug it. */
  readonly signals: readonly string[];
  /** Asked when confidence is too low to proceed silently. */
  readonly clarifyingQuestion: string | null;
}

export interface UnderstandingAdapter {
  readonly name: string;
  understand(text: string): Promise<UnderstandingResult>;
}

interface ServiceRule {
  readonly category: string;
  readonly service: string;
  /** Terms that strongly indicate this exact service. */
  readonly strong: readonly string[];
  /** Supporting terms. */
  readonly weak?: readonly string[];
  readonly urgency: Urgency;
}

/**
 * Rules are ordered most-specific first. Keep the vocabulary close to how
 * people actually describe problems, not to trade jargon.
 */
const SERVICE_RULES: readonly ServiceRule[] = [
  // ── Plumbing ────────────────────────────────────────────────────────────
  {
    category: 'plumbing', service: 'burst_pipe', urgency: 'emergency',
    strong: ['פיצוץ צינור', 'צינור התפוצץ', 'הצפה', 'מפרץ מים', 'פרץ מים'],
    weak: ['מים בכל הבית', 'שיטפון'],
  },
  {
    category: 'plumbing', service: 'sink_leak', urgency: 'high',
    strong: ['נזילה מתחת לכיור', 'נזילה בכיור', 'מים מתחת לכיור', 'דולף מתחת לכיור'],
    weak: ['נזילה', 'דולף', 'מטפטף', 'כיור'],
  },
  {
    category: 'plumbing', service: 'blocked_drain', urgency: 'high',
    strong: ['סתימה', 'סתום', 'הביוב עולה', 'מים לא יורדים', 'פקק בצינור'],
    weak: ['ניקוז', 'מסתם'],
  },
  {
    category: 'plumbing', service: 'toilet_repair', urgency: 'normal',
    strong: ['אסלה', 'ניאגרה', 'השירותים לא עובדים'],
    weak: ['הדחה'],
  },
  {
    category: 'plumbing', service: 'boiler_issue', urgency: 'normal',
    strong: ['דוד', 'אין מים חמים', 'דוד שמש', 'בוילר'],
  },

  // ── Electrical ──────────────────────────────────────────────────────────
  {
    category: 'electrical', service: 'power_outage', urgency: 'emergency',
    strong: ['אין חשמל', 'הפסקת חשמל', 'החשמל נפל', 'הכל חשוך'],
    weak: ['לוח חשמל', 'פקק קפץ'],
  },
  {
    category: 'electrical', service: 'short_circuit', urgency: 'emergency',
    strong: ['קצר חשמלי', 'קצר', 'ריח שרוף', 'ניצוצות', 'עשן מהשקע'],
  },
  {
    category: 'electrical', service: 'socket_repair', urgency: 'normal',
    strong: ['שקע לא עובד', 'תיקון שקע', 'מפסק לא עובד'],
    weak: ['שקע', 'מפסק'],
  },
  {
    category: 'electrical', service: 'light_fixture', urgency: 'low',
    strong: ['התקנת גוף תאורה', 'להתקין מנורה', 'גוף תאורה'],
    weak: ['מנורה', 'תאורה', 'נורה'],
  },

  // ── Air conditioning ────────────────────────────────────────────────────
  {
    category: 'air_conditioning', service: 'ac_not_cooling', urgency: 'high',
    strong: ['המזגן לא מקרר', 'מזגן לא מקרר', 'מזגן לא עובד', 'המזגן לא מצנן'],
    weak: ['חם בבית', 'מזגן'],
  },
  {
    category: 'air_conditioning', service: 'ac_leaking', urgency: 'normal',
    strong: ['מזגן מטפטף', 'מזגן נוזל', 'מים מהמזגן'],
  },
  {
    category: 'air_conditioning', service: 'ac_service', urgency: 'low',
    strong: ['ניקוי מזגן', 'טיפול למזגן', 'שטיפת מזגן'],
    weak: ['מסננים'],
  },
  {
    category: 'air_conditioning', service: 'ac_install', urgency: 'low',
    strong: ['התקנת מזגן', 'להתקין מזגן', 'מזגן חדש'],
  },

  // ── Locksmith ───────────────────────────────────────────────────────────
  {
    category: 'locksmith', service: 'car_lockout', urgency: 'emergency',
    strong: ['ננעלתי מחוץ לרכב', 'מפתחות ברכב', 'נעול באוטו', 'מפתח נשאר באוטו'],
  },
  {
    category: 'locksmith', service: 'locked_out', urgency: 'emergency',
    strong: ['ננעלתי מחוץ לבית', 'ננעלתי בחוץ', 'אין לי מפתח', 'הדלת נטרקה', 'נעול בחוץ'],
    weak: ['מנעול', 'מפתח', 'ננעלתי'],
  },
  {
    category: 'locksmith', service: 'lock_replacement', urgency: 'normal',
    strong: ['החלפת צילינדר', 'להחליף מנעול', 'צילינדר'],
  },

  // ── Pest control ────────────────────────────────────────────────────────
  {
    category: 'pest_control', service: 'cockroaches', urgency: 'high',
    strong: ['תיקנים', 'ג׳וקים', 'גוקים', 'מקקים'],
  },
  {
    category: 'pest_control', service: 'rodents', urgency: 'high',
    strong: ['עכברים', 'חולדות', 'מכרסמים'],
  },
  {
    category: 'pest_control', service: 'ants', urgency: 'normal',
    strong: ['נמלים'],
  },
  {
    category: 'pest_control', service: 'cockroaches', urgency: 'high',
    strong: ['הדברה', 'להדביר', 'מזיקים'],
  },

  // ── Cleaning ────────────────────────────────────────────────────────────
  {
    category: 'cleaning', service: 'post_renovation', urgency: 'low',
    strong: ['ניקיון אחרי שיפוץ', 'אחרי שיפוץ', 'אבק שיפוץ'],
  },
  {
    category: 'cleaning', service: 'apartment_cleaning', urgency: 'low',
    strong: ['ניקיון דירה', 'לנקות את הבית', 'ניקוי דירה', 'מנקה'],
    weak: ['ניקיון', 'לנקות'],
  },

  // ── Gardening ───────────────────────────────────────────────────────────
  {
    category: 'gardening', service: 'tree_pruning', urgency: 'low',
    strong: ['גיזום עצים', 'לגזום עץ', 'גיזום'],
  },
  {
    category: 'gardening', service: 'garden_maintenance', urgency: 'low',
    strong: ['תחזוקת גינה', 'לכסח את הדשא', 'כיסוח דשא', 'גינה'],
    weak: ['דשא', 'גינון'],
  },
];

/** Words that raise urgency regardless of category. */
const URGENCY_ESCALATORS: readonly { terms: readonly string[]; urgency: Urgency }[] = [
  { terms: ['דחוף', 'מיד', 'עכשיו', 'חירום', 'מסוכן', 'הצפה', 'עשן'], urgency: 'emergency' },
  { terms: ['היום', 'בהקדם', 'כמה שיותר מהר'], urgency: 'high' },
];

const URGENCY_RANK: Record<Urgency, number> = { low: 0, normal: 1, high: 2, emergency: 3 };

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ְ-ֽֿ-ׇ]/g, '') // strip Hebrew niqqud
    .replace(/["'`״׳]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Does `haystack` express this phrase?
 *
 * A plain substring test is too brittle for natural phrasing: a customer
 * writing "יש מים שיוצאים מתחת לכיור" does not contain the literal string
 * "מים מתחת לכיור", because another word sits in between. So a multi-word
 * phrase matches when ALL of its meaningful tokens appear in the text.
 *
 * Longer phrases score higher (see phraseScore), which is what keeps a
 * specific rule ahead of a generic one.
 */
function phraseMatches(haystack: string, phrase: string): boolean {
  const tokens = phraseTokens(phrase);
  if (tokens.length === 0) return false;
  return tokens.every((token) => haystack.includes(token));
}

function phraseTokens(phrase: string): string[] {
  return normalise(phrase)
    .split(' ')
    .filter((token) => token.length > 1);
}

/** More words matched means a more specific, more trustworthy signal. */
function phraseScore(phrase: string, base: number, perExtraToken: number): number {
  return base + perExtraToken * Math.max(0, phraseTokens(phrase).length - 1);
}

/**
 * Deterministic rule-based classifier. No network, no model, no randomness:
 * the same text always yields the same result.
 */
export class RuleBasedUnderstanding implements UnderstandingAdapter {
  readonly name = 'rules';

  async understand(text: string): Promise<UnderstandingResult> {
    return this.understandSync(text);
  }

  understandSync(text: string): UnderstandingResult {
    const haystack = normalise(text);

    if (haystack.length < 3) {
      return {
        category: null, service: null, urgency: 'normal', confidence: 0, signals: [],
        clarifyingQuestion: 'תארו בבקשה מה קרה, במשפט קצר.',
      };
    }

    let best: { rule: ServiceRule; score: number; signals: string[] } | null = null;

    for (const rule of SERVICE_RULES) {
      const signals: string[] = [];
      let score = 0;

      for (const term of rule.strong) {
        if (phraseMatches(haystack, term)) {
          score += phraseScore(term, 0.4, 0.15);
          signals.push(term);
        }
      }
      for (const term of rule.weak ?? []) {
        if (phraseMatches(haystack, term)) {
          score += phraseScore(term, 0.12, 0.04);
          signals.push(term);
        }
      }

      if (score > 0 && (best === null || score > best.score)) {
        best = { rule, score, signals };
      }
    }

    if (!best) {
      return {
        category: null, service: null, urgency: 'normal', confidence: 0, signals: [],
        clarifyingQuestion: 'לא הצלחנו לזהות את סוג התקלה. באיזה תחום מדובר?',
      };
    }

    // Urgency is the higher of the rule's own urgency and any escalator.
    let urgency = best.rule.urgency;
    const urgencySignals: string[] = [];
    for (const escalator of URGENCY_ESCALATORS) {
      for (const term of escalator.terms) {
        if (phraseMatches(haystack, term)) {
          urgencySignals.push(term);
          if (URGENCY_RANK[escalator.urgency] > URGENCY_RANK[urgency]) {
            urgency = escalator.urgency;
          }
        }
      }
    }

    const confidence = Math.min(0.98, Math.round(best.score * 100) / 100);

    return {
      category: best.rule.category,
      service: best.rule.service,
      urgency,
      confidence,
      signals: [...best.signals, ...urgencySignals],
      clarifyingQuestion:
        confidence < 0.5
          ? 'רק כדי לוודא — זה מה שהתכוונתם? אפשר לתקן את הבחירה.'
          : null,
    };
  }
}

/**
 * The service callers use. Takes an adapter so the classifier can be
 * replaced (rules today, AI later) without changing call sites.
 */
export class JobUnderstandingService {
  constructor(private readonly adapter: UnderstandingAdapter = new RuleBasedUnderstanding()) {}

  get adapterName(): string {
    return this.adapter.name;
  }

  async understand(text: string): Promise<UnderstandingResult> {
    return this.adapter.understand(text);
  }
}

export const jobUnderstanding = new JobUnderstandingService();
