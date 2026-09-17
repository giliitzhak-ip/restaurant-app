import type { JobUrgency } from '@/types/database';

export interface ClassificationInput {
  text: string;
  /** Category slugs the platform currently offers, for grounding the answer. */
  categorySlugs: string[];
  /** Service slugs keyed by category slug. */
  serviceSlugs?: Record<string, string[]>;
}

export interface ClassificationResult {
  categorySlug: string | null;
  serviceSlug: string | null;
  urgency: JobUrgency;
  /** 0–1. Below ~0.5 the UI should suggest rather than pre-select. */
  confidence: number;
  /** Short Hebrew title suggested for the job. */
  suggestedTitle?: string | null;
}

/**
 * Turns free text ("תיקון נזילה מתחת לכיור") into a category, service and
 * urgency.
 *
 * The interface is the point: today a keyword classifier implements it, and an
 * LLM adapter can replace it without touching the wizard.
 */
export interface AIJobClassifier {
  readonly name: string;
  classify(input: ClassificationInput): Promise<ClassificationResult>;
}

/** Hebrew and English keywords that map onto the shipped catalogue. */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  plumbing: ['נזילה', 'סתימה', 'ברז', 'צנרת', 'אינסטלציה', 'דוד', 'אסלה', 'כיור', 'מקלחת', 'ניאגרה'],
  electricity: ['חשמל', 'קצר', 'שקע', 'מפסק', 'לוח חשמל', 'תאורה', 'נורה', 'חשמלאי', 'פיוז'],
  'pest-control': ['תיקנים', 'ג׳וקים', 'גוקים', 'נמלים', 'עכברים', 'חולדות', 'פרעושים', 'פשפשים', 'הדברה', 'מזיקים'],
  gardening: ['גינה', 'דשא', 'גיזום', 'עצים', 'השקיה', 'גנן', 'צמחייה'],
  hvac: ['מזגן', 'מיזוג', 'מאוורר', 'קירור', 'חימום', 'גז מזגן'],
  renovations: ['שיפוץ', 'ריצוף', 'גבס', 'בנייה', 'קיר', 'מטבח חדש', 'חדר רחצה'],
  cleaning: ['ניקיון', 'ניקוי', 'לנקות', 'מנקה', 'ספות', 'שטיח'],
  locksmith: ['מנעול', 'מנעולן', 'צילינדר', 'דלת נעולה', 'מפתח', 'פריצה'],
  moving: ['הובלה', 'מוביל', 'העברת דירה', 'מנוף', 'ארגזים'],
  painting: ['צבע', 'צביעה', 'צבעי', 'לצבוע', 'סיד'],
  carpentry: ['נגר', 'נגרות', 'ארון', 'מטבח', 'דלת', 'רהיט', 'מדף'],
  aluminum: ['אלומיניום', 'תריס', 'חלון', 'רשת', 'מרפסת סגורה'],
  glazing: ['זכוכית', 'זגג', 'מקלחון', 'מראה', 'שמשה'],
  sealing: ['איטום', 'רטיבות', 'נזילה מהגג', 'עובש', 'גג דולף'],
  sewage: ['ביוב', 'שאיבה', 'בור ספיגה', 'ריח ביוב'],
  maintenance: ['תחזוקה', 'הנדימן', 'תיקון קטן', 'תיקונים'],
};

const SERVICE_KEYWORDS: Record<string, string[]> = {
  leak: ['נזילה', 'דולף', 'טפטוף'],
  'leak-detection': ['איתור נזילה', 'לא מוצא את הנזילה'],
  blockage: ['סתימה', 'סתום', 'לא יורד'],
  'faucet-replace': ['ברז', 'החלפת ברז'],
  'toilet-repair': ['אסלה', 'ניאגרה'],
  boiler: ['דוד', 'מים חמים'],
  'short-circuit': ['קצר', 'קפץ הפקק', 'אין חשמל'],
  'new-point': ['נקודת חשמל', 'שקע חדש'],
  lighting: ['תאורה', 'נורה', 'גוף תאורה'],
  cockroaches: ['תיקנים', 'ג׳וקים', 'גוקים'],
  ants: ['נמלים'],
  mice: ['עכברים'],
  rats: ['חולדות'],
  bedbugs: ['פשפשים'],
  fleas: ['פרעושים'],
  'ac-install': ['התקנת מזגן', 'מזגן חדש'],
  'ac-service': ['ניקוי מזגן', 'טיפול במזגן'],
  'ac-repair': ['מזגן לא מקרר', 'תיקון מזגן'],
  'ac-gas': ['גז למזגן', 'מילוי גז'],
  lockout: ['דלת נעולה', 'ננעלתי', 'פריצת דלת'],
  cylinder: ['צילינדר'],
  'apartment-move': ['הובלת דירה'],
  'single-item': ['פריט בודד', 'ארון בודד'],
  mowing: ['דשא', 'כיסוח'],
  pruning: ['גיזום'],
  'roof-sealing': ['גג', 'איטום גג'],
  'damp-treatment': ['רטיבות', 'עובש'],
  'sewer-opening': ['ביוב סתום', 'פתיחת ביוב'],
  'apartment-paint': ['צביעת דירה'],
  'furniture-assembly': ['הרכבת רהיט', 'הרכבה'],
};

const URGENT_WORDS = ['דחוף', 'מיד', 'עכשיו', 'הצפה', 'חירום', 'בוער', 'מסוכן'];
const TODAY_WORDS = ['היום', 'בהקדם', 'הערב'];
const TOMORROW_WORDS = ['מחר'];

function countHits(text: string, keywords: string[]): number {
  return keywords.reduce((count, keyword) => (text.includes(keyword) ? count + 1 : count), 0);
}

/**
 * Keyword classifier — deterministic, offline, and good enough to pre-select a
 * category in the wizard. It never overrides the customer's own choice.
 */
export class KeywordJobClassifier implements AIJobClassifier {
  readonly name = 'keyword';

  async classify(input: ClassificationInput): Promise<ClassificationResult> {
    const text = input.text.toLowerCase().trim();
    if (!text) {
      return { categorySlug: null, serviceSlug: null, urgency: 'today', confidence: 0 };
    }

    const scored = Object.entries(CATEGORY_KEYWORDS)
      .filter(([slug]) => input.categorySlugs.length === 0 || input.categorySlugs.includes(slug))
      .map(([slug, keywords]) => ({ slug, hits: countHits(text, keywords) }))
      .filter((entry) => entry.hits > 0)
      .sort((a, b) => b.hits - a.hits);

    const best = scored[0];
    const runnerUp = scored[1];

    const allowedServices = best ? input.serviceSlugs?.[best.slug] : undefined;
    const serviceMatch = best
      ? Object.entries(SERVICE_KEYWORDS)
          .filter(([slug]) => !allowedServices || allowedServices.includes(slug))
          .map(([slug, keywords]) => ({ slug, hits: countHits(text, keywords) }))
          .filter((entry) => entry.hits > 0)
          .sort((a, b) => b.hits - a.hits)[0]
      : undefined;

    const urgency: JobUrgency = countHits(text, URGENT_WORDS)
      ? 'now'
      : countHits(text, TODAY_WORDS)
        ? 'today'
        : countHits(text, TOMORROW_WORDS)
          ? 'tomorrow'
          : 'today';

    // Confidence reflects both how many keywords hit and how clear the winner is.
    const margin = best ? best.hits - (runnerUp?.hits ?? 0) : 0;
    const confidence = best
      ? Math.min(0.95, 0.4 + best.hits * 0.15 + margin * 0.1)
      : 0;

    return {
      categorySlug: best?.slug ?? null,
      serviceSlug: serviceMatch?.slug ?? null,
      urgency,
      confidence: Math.round(confidence * 100) / 100,
      suggestedTitle: input.text.trim().slice(0, 60) || null,
    };
  }
}

let classifier: AIJobClassifier = new KeywordJobClassifier();

export function getJobClassifier(): AIJobClassifier {
  return classifier;
}

/** Swap in an LLM-backed implementation without touching any call site. */
export function setJobClassifier(next: AIJobClassifier) {
  classifier = next;
}
