/**
 * חיפוש עברי/אנגלי עם דירוג התאמות.
 * סדר הדירוג הנדרש: התאמה מלאה, מתחיל ברצף, מכיל רצף, שם חלופי/חומר פעיל.
 */

const FINAL_LETTERS: Record<string, string> = {
  'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ',
};

/** מנרמל טקסט: אותיות סופיות, ניקוד, גרשיים, מקפים ורווחים. */
export function normalize(input: string): string {
  if (!input) return '';
  let out = input.toLowerCase().normalize('NFKD');
  out = out.replace(/[֑-ׇ]/g, ''); // ניקוד וטעמים
  out = out.replace(/[̀-ͯ]/g, ''); // דיאקריטיים לטיניים
  out = out.replace(/[׳'`´’]/g, '');
  out = out.replace(/[״"“”]/g, '');
  out = out.replace(/[-–—_/\\.,]/g, ' ');
  out = out.replace(/[ךםןףץ]/g, (c) => FINAL_LETTERS[c] ?? c);
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

/** גרסה ללא רווחים – מאפשרת התאמה גם כשהמשתמש מקליד "דרקר10" */
const squash = (s: string): string => normalize(s).replace(/ /g, '');

export const MATCH_EXACT = 0;
export const MATCH_PREFIX = 1;
export const MATCH_CONTAINS = 2;
export const MATCH_ALIAS = 3;
export const NO_MATCH = 99;

export interface Searchable {
  /** הטקסט הראשי שעליו מדורגים */
  primary: string;
  /** שמות חלופיים, חומר פעיל, מספר רישום וכו' */
  secondary?: string[];
}

/** מחזיר דרגת התאמה; NO_MATCH אם אין התאמה כלל. */
export function matchRank(query: string, item: Searchable): number {
  const q = normalize(query);
  if (!q) return NO_MATCH;
  const qs = squash(query);
  const primary = normalize(item.primary);
  const primarySquashed = squash(item.primary);

  if (primary === q || primarySquashed === qs) return MATCH_EXACT;
  if (primary.startsWith(q) || primarySquashed.startsWith(qs)) return MATCH_PREFIX;
  if (primary.includes(q) || primarySquashed.includes(qs)) return MATCH_CONTAINS;

  for (const alt of item.secondary ?? []) {
    const n = normalize(alt);
    const s = squash(alt);
    if (n === q || n.startsWith(q) || n.includes(q) || s.includes(qs)) return MATCH_ALIAS;
  }
  return NO_MATCH;
}

export interface Ranked<T> {
  item: T;
  rank: number;
}

/** מדרג ומחזיר עד `limit` תוצאות. אין תוצאות לפני הקלדה. */
export function rankedSearch<T>(
  query: string,
  items: T[],
  toSearchable: (item: T) => Searchable,
  limit = 8,
): T[] {
  if (!normalize(query)) return [];
  const ranked: Ranked<T>[] = [];
  for (const item of items) {
    const rank = matchRank(query, toSearchable(item));
    if (rank !== NO_MATCH) ranked.push({ item, rank });
  }
  ranked.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const an = normalize(toSearchable(a.item).primary);
    const bn = normalize(toSearchable(b.item).primary);
    if (an.length !== bn.length) return an.length - bn.length;
    return an.localeCompare(bn, 'he');
  });
  return ranked.slice(0, limit).map((r) => r.item);
}

export interface HighlightPart {
  text: string;
  hit: boolean;
}

/**
 * מחלק מחרוזת לחלקים לצורך הדגשת רצף האותיות שהוקלד.
 * ההשוואה נעשית על הטקסט המנורמל, אך החיתוך מוחזר על הטקסט המקורי.
 */
export function highlightParts(text: string, query: string): HighlightPart[] {
  const q = normalize(query);
  if (!q) return [{ text, hit: false }];

  // מפה מאינדקס מנורמל לאינדקס מקורי
  const map: number[] = [];
  let normalized = '';
  for (let i = 0; i < text.length; i++) {
    const piece = normalize(text[i]);
    for (let k = 0; k < piece.length; k++) {
      normalized += piece[k];
      map.push(i);
    }
  }
  const at = normalized.indexOf(q);
  if (at === -1) return [{ text, hit: false }];

  const start = map[at];
  const endIdx = map[Math.min(at + q.length - 1, map.length - 1)];
  const end = endIdx + 1;
  const parts: HighlightPart[] = [];
  if (start > 0) parts.push({ text: text.slice(0, start), hit: false });
  parts.push({ text: text.slice(start, end), hit: true });
  if (end < text.length) parts.push({ text: text.slice(end), hit: false });
  return parts;
}
