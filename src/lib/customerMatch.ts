import type { Customer } from '../types';
import { normalizeIsraeliPhone } from './phone';

/**
 * זיהוי לקוח שדומה ללקוח קיים.
 *
 * הכלל: המערכת מתריעה, המשתמש מחליט. אין מיזוג אוטומטי ואין חסימה –
 * שני לקוחות באותה כתובת (בניין, קניון) ושני לקוחות באותו שם
 * (שתי סניפים) הם מצבים אמיתיים.
 */

export type MatchStrength = 'same' | 'likely' | 'possible';

export interface CustomerMatch {
  customer: Customer;
  strength: MatchStrength;
  /** מה בדיוק זהה, להצגה למשתמש. */
  reasons: string[];
}

/** נרמול להשוואה: רווחים כפולים, גרשיים וסימני פיסוק אינם משנים. */
export function normalizeForMatch(value: string | undefined): string {
  return String(value ?? '')
    .replace(/[״"'`׳]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

/** מספר הבית והרחוב בלבד, כדי ש"הרצל 10, תל אביב" ו"הרצל 10 תל-אביב" יישוו. */
function addressKey(value: string | undefined): string {
  return normalizeForMatch(value).replace(/\s+/g, ' ');
}

function phoneKey(value: string | undefined): string {
  return normalizeIsraeliPhone(value ?? '').e164 ?? '';
}

export interface CustomerDraftLike {
  name: string;
  address: string;
  phone?: string;
  email?: string;
}

/**
 * מחזיר לקוחות קיימים שדומים לטיוטה, מהחזק לחלש.
 * רשימה ריקה = אין חשד.
 */
export function findSimilarCustomers(
  draft: CustomerDraftLike,
  customers: Customer[],
): CustomerMatch[] {
  const name = normalizeForMatch(draft.name);
  const address = addressKey(draft.address);
  const phone = phoneKey(draft.phone);
  const email = normalizeForMatch(draft.email);
  if (!name && !phone) return [];

  const matches: CustomerMatch[] = [];

  for (const candidate of customers) {
    if (candidate.archived) continue;
    const reasons: string[] = [];
    const sameName = Boolean(name) && normalizeForMatch(candidate.name) === name;
    const sameAddress = Boolean(address) && addressKey(candidate.address) === address;
    const samePhone = Boolean(phone) && phoneKey(candidate.phone) === phone;
    const samePhoneAlt = Boolean(phone) && phoneKey(candidate.phoneAlt) === phone;
    const sameEmail = Boolean(email) && normalizeForMatch(candidate.email) === email;

    if (sameName) reasons.push('אותו שם');
    if (sameAddress) reasons.push('אותה כתובת');
    if (samePhone || samePhoneAlt) reasons.push('אותו טלפון');
    if (sameEmail) reasons.push('אותו דוא״ל');
    if (reasons.length === 0) continue;

    let strength: MatchStrength;
    if (sameName && sameAddress) strength = 'same';
    else if (samePhone || samePhoneAlt || (sameName && sameEmail)) strength = 'likely';
    else strength = 'possible';

    matches.push({ customer: candidate, strength, reasons });
  }

  const order: Record<MatchStrength, number> = { same: 0, likely: 1, possible: 2 };
  return matches.sort((a, b) => order[a.strength] - order[b.strength]).slice(0, 5);
}

export const STRENGTH_LABEL: Record<MatchStrength, string> = {
  same: 'כנראה אותו לקוח',
  likely: 'ייתכן אותו לקוח',
  possible: 'דומה',
};
