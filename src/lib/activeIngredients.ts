/**
 * פענוח חומרים פעילים וריכוזם מתוך טקסט חופשי, כפי שהוא מופיע במאגר הרשמי.
 *
 * דוגמאות לצורות שמתקבלות:
 *   "Bifenthrin 9.6%"
 *   "ציפרמתרין 10% , טטרהמתרין 2%"
 *   "Brodifacoum 0.005 %"
 *   "Cypermethrin 10%; Piperonyl Butoxide 10%"
 *   "Imidacloprid 200 g/l"
 *
 * הפענוח שמרני בכוונה: אם לא נמצא ריכוז, הוא מסומן "לא הוזן" ולא מנוחש.
 */

import { NOT_ENTERED } from '../types';

export interface ParsedIngredient {
  name: string;
  /** הריכוז כפי שנקרא מהמקור, למשל "9.6%" או "200 g/l". NOT_ENTERED אם לא נמצא. */
  concentration: string;
}

/** מפריד בין חומרים פעילים: פסיק, נקודה-פסיק, קו נטוי אנכי, "+" או המילה "ו". */
const SEPARATOR = /\s*[,;|]\s*|\s+\+\s+/;

/**
 * ריכוז: מספר (עם נקודה עשרונית) ואחריו אחוז או יחידת ריכוז נפוצה.
 * היחידה נלכדת כדי שנשמר בדיוק מה שכתוב במקור.
 */
const CONCENTRATION = /(\d+(?:[.,]\d+)?)\s*(%|g\/l|gr\/l|גר'?\/ליטר|מ"?ג\/ק"?ג|mg\/kg|ppm)/i;

function cleanName(raw: string): string {
  return raw
    .replace(CONCENTRATION, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/^[\s\-–—:·•]+|[\s\-–—:·•,;]+$/g, '')
    .trim();
}

function normalizeUnit(unit: string): string {
  const u = unit.toLowerCase();
  if (u === '%') return '%';
  if (u === 'gr/l') return 'g/l';
  return unit;
}

/** מפענח מחרוזת אחת לחומר פעיל בודד. */
export function parseIngredient(raw: string): ParsedIngredient | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;

  const match = text.match(CONCENTRATION);
  const name = cleanName(text);
  if (!name) return null;

  if (!match) return { name, concentration: NOT_ENTERED };

  const value = match[1].replace(',', '.');
  const unit = normalizeUnit(match[2]);
  return {
    name,
    concentration: unit === '%' ? `${value}%` : `${value} ${unit}`,
  };
}

/**
 * מפענח רשימת חומרים פעילים.
 * `concentrationHint` משמש כשהריכוז מגיע בעמודה נפרדת במקור,
 * והוא חל רק כאשר יש חומר פעיל אחד בלבד וללא ריכוז משלו.
 */
export function parseActiveIngredients(raw: string, concentrationHint?: string): ParsedIngredient[] {
  const text = String(raw ?? '').trim();
  if (!text) return [];

  const parts = text.split(SEPARATOR).map((p) => p.trim()).filter(Boolean);
  const parsed = parts.map(parseIngredient).filter((p): p is ParsedIngredient => p !== null);

  if (parsed.length === 1 && parsed[0].concentration === NOT_ENTERED && concentrationHint) {
    const fromHint = parseIngredient(`x ${concentrationHint}`);
    if (fromHint && fromHint.concentration !== NOT_ENTERED) {
      return [{ name: parsed[0].name, concentration: fromHint.concentration }];
    }
  }
  return parsed;
}

/** תצוגה אחידה: "Bifenthrin 9.6% · Tetramethrin 2%" */
export function formatIngredients(list: ParsedIngredient[]): string {
  if (list.length === 0) return NOT_ENTERED;
  return list.map((i) => `${i.name} ${i.concentration}`).join(' · ');
}
