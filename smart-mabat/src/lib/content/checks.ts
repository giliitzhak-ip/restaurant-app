import type { CheckResult } from "../types";
import { maxSimilarity } from "./similarity";

/** Instagram hard limits. */
export const IG_CAPTION_MAX = 2200;
export const IG_HASHTAG_MAX = 30;
export const DUPLICATE_THRESHOLD = 0.45;

export interface CheckInput {
  caption: string;
  hashtags: string[];
  cta: string | null;
  createdBy: "agent" | "admin";
  hasMedia: boolean;
  mediaType: "IMAGE" | "REELS";
  recentCaptions: string[]; // captions of other recent posts (exclude this post)
}

/**
 * Patterns that suggest invented facts: testimonials, specific past projects, client counts,
 * superlative rankings, or concrete technical specs / model numbers.
 * For agent-written posts these are hard errors; for posts you wrote yourself they're warnings
 * (you know what's true about your business — the AI does not).
 */
const FABRICATION_PATTERNS: { id: string; label: string; re: RegExp }[] = [
  {
    id: "testimonial",
    label: "נראה כמו המלצת לקוח / ציטוט",
    re: /(לקוח(?:ה|ות)?\s+(?:מרוצ|ממליצ|כתב|סיפר|אמר|שיתף))|(["״“][^"״”]{8,}["״”]\s*[-–—]\s*\S+)|(⭐{3,})/u,
  },
  {
    id: "project_claim",
    label: "נראה כמו תיאור פרויקט ספציפי שבוצע",
    re: /((?:התקנו|ביצענו|השלמנו|סיימנו)\s+(?:השבוע|החודש|לאחרונה|אתמול|היום)?\s*(?:מערכת|פרויקט|התקנה|\d+\s+מצלמות))|(פרויקט\s+(?:שביצענו|שהשלמנו|אחרון\s+שלנו))/u,
  },
  {
    id: "numbers_claim",
    label: "טענה מספרית על העסק (מספר לקוחות/שנים/התקנות)",
    re: /(\d[\d,]*\+?\s*(?:לקוחות|התקנות|פרויקטים|עסקים\s+מרוצים|שנות\s+ניסיון|שנים\s+של\s+ניסיון))|(מעל\s+\d[\d,]*\s+(?:לקוחות|התקנות|פרויקטים))/u,
  },
  {
    id: "ranking",
    label: "טענת עליונות שלא ניתן לאמת",
    re: /(מספר\s*1\b|מס['׳]\s*1\b|הכי\s+(?:טוב|גדול|מוביל)(?:ה|ים)?\s+(?:בישראל|בארץ|באזור))|(החברה\s+המובילה)/u,
  },
  {
    id: "specs",
    label: "מפרט טכני ספציפי / דגם",
    re: /(\b\d{1,2}(?:\.\d)?\s?(?:MP|מגה\s?פיקסל)\b)|(\b\d{2,3}\s?(?:מטר|מ['׳])\s+(?:ראיית\s+לילה|טווח))|(\b(?:DS|IPC|HFW|HDW|SD|DH|NVR|XVR)-?[A-Z0-9]{2,}[-A-Z0-9]*\b)|(\b\d{2,3}x\s?(?:זום|zoom)\b)/iu,
  },
  {
    id: "guarantee",
    label: "הבטחה מוחלטת (100%/מבטיחים/אף פעם)",
    re: /(100%\s*(?:הגנה|אבטחה|בטוח))|(מבטיחים\s+ש)|(אף\s+פורץ\s+לא)|(הגנה\s+מוחלטת)/u,
  },
  {
    id: "price",
    label: "מחיר או מבצע ספציפי",
    re: /(₪\s?\d)|(\d+\s?(?:ש["״]ח|שקל))|(\d+%\s*הנחה)/u,
  },
];

const CTA_HINTS = /(שלחו|צרו\s+קשר|התקשרו|לייעוץ|להצעת\s+מחיר|בדיירקט|בהודעה|וואטסאפ|לפרטים|דברו\s+איתנו|השאירו)/u;

export function runChecks(input: CheckInput): CheckResult[] {
  const results: CheckResult[] = [];
  const caption = input.caption ?? "";
  const full = `${caption}\n${input.hashtags.join(" ")}`;

  results.push({
    id: "caption_present",
    label: "יש טקסט לפוסט",
    ok: caption.trim().length >= 80,
    severity: "error",
    detail: `${caption.trim().length} תווים (מינימום 80)`,
  });

  results.push({
    id: "caption_length",
    label: `אורך כולל עד ${IG_CAPTION_MAX} תווים`,
    ok: full.length <= IG_CAPTION_MAX,
    severity: "error",
    detail: `${full.length} תווים`,
  });

  const tagCount = new Set([...input.hashtags, ...(caption.match(/#[^\s#]+/g) ?? [])]).size;
  results.push({
    id: "hashtag_limit",
    label: `עד ${IG_HASHTAG_MAX} האשטגים (מגבלת אינסטגרם)`,
    ok: tagCount <= IG_HASHTAG_MAX,
    severity: "error",
    detail: `${tagCount} האשטגים`,
  });
  results.push({
    id: "hashtag_recommended",
    label: "מומלץ 5–15 האשטגים",
    ok: tagCount >= 3 && tagCount <= 15,
    severity: "warn",
    detail: `${tagCount} האשטגים`,
  });

  const letters = caption.match(/\p{L}/gu) ?? [];
  const hebrew = caption.match(/[א-ת]/g) ?? [];
  const ratio = letters.length ? hebrew.length / letters.length : 0;
  results.push({
    id: "hebrew",
    label: "הטקסט בעברית",
    ok: ratio >= 0.6,
    severity: "error",
    detail: `${Math.round(ratio * 100)}% אותיות עבריות`,
  });

  results.push({
    id: "cta",
    label: "יש הנעה לפעולה",
    ok: CTA_HINTS.test(`${caption} ${input.cta ?? ""}`),
    severity: "error",
  });

  for (const p of FABRICATION_PATTERNS) {
    const m = full.match(p.re);
    results.push({
      id: `no_${p.id}`,
      label: `ללא: ${p.label}`,
      ok: !m,
      severity: input.createdBy === "agent" ? "error" : "warn",
      detail: m ? `נמצא: "${m[0].trim()}"` : undefined,
    });
  }

  const sim = maxSimilarity(caption, input.recentCaptions);
  results.push({
    id: "not_duplicate",
    label: "לא חוזר על פוסט קודם",
    ok: sim.score < DUPLICATE_THRESHOLD,
    severity: "error",
    detail: `דמיון מקסימלי ${Math.round(sim.score * 100)}%`,
  });

  results.push({
    id: "media",
    label: input.mediaType === "REELS" ? "יש סרטון" : "יש תמונה",
    ok: input.hasMedia,
    severity: "error",
  });

  return results;
}

export function checksPassed(results: CheckResult[]): boolean {
  return results.every((r) => r.ok || r.severity !== "error");
}
