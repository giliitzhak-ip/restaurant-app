/**
 * זהות, סיסמאות והרשאות. ללא תלויות חיצוניות – node:crypto בלבד.
 *
 * סיסמאות נשמרות כגיבוב scrypt עם מלח אקראי לכל משתמש.
 * אסימוני התחברות נשמרים כגיבוב בלבד, כך שדליפת מסד הנתונים
 * אינה מאפשרת התחזות למשתמש קיים.
 */

import crypto from 'node:crypto';

const SCRYPT_KEYLEN = 64;
const SESSION_DAYS = 30;
const MAX_FAILED_LOGINS = 8;
const LOCK_MINUTES = 15;

export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN).toString('hex');
  return { hash, salt };
}

/** השוואה בזמן קבוע, כדי לא לדלוף מידע דרך זמן התגובה. */
export function verifyPassword(password, salt, expectedHash) {
  const actual = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function sessionExpiry(from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + SESSION_DAYS);
  return d.toISOString();
}

/** דרישות סיסמה מינימליות. מוחזרת רשימת בעיות בעברית. */
export function passwordProblems(password) {
  const p = String(password ?? '');
  const problems = [];
  if (p.length < 8) problems.push('הסיסמה חייבת להכיל לפחות 8 תווים.');
  if (!/[A-Za-z֐-׿]/.test(p)) problems.push('הסיסמה חייבת להכיל לפחות אות אחת.');
  if (!/[0-9]/.test(p)) problems.push('הסיסמה חייבת להכיל לפחות ספרה אחת.');
  return problems;
}

export function isValidEmail(email) {
  const e = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

/* ───────── מצב מנוי וגישה ───────── */

export const ACCESS = {
  FULL: 'full',           // מאושר ובתוקף – קריאה וכתיבה
  READ_ONLY: 'read_only', // מאושר אך התשלום פג – קריאה בלבד, אין אובדן נתונים
  BLOCKED: 'blocked',     // ממתין לאישור, נדחה או הושעה
};

/**
 * קובע את רמת הגישה של עסק.
 * ארגון שתוקפו פג אינו נחסם לקריאה – המדביר חייב להגיע לתיעוד שלו.
 */
export function organizationAccess(org, now = new Date()) {
  if (!org) return { level: ACCESS.BLOCKED, reason: 'העסק לא נמצא.' };
  if (org.status === 'pending') {
    return { level: ACCESS.BLOCKED, reason: 'ההרשמה ממתינה לאישור מנהל המערכת.' };
  }
  if (org.status === 'rejected') {
    return { level: ACCESS.BLOCKED, reason: 'ההרשמה נדחתה.' };
  }
  if (org.status === 'suspended') {
    return { level: ACCESS.BLOCKED, reason: 'הגישה לעסק הושעתה.' };
  }
  if (org.paid_until) {
    const until = new Date(`${org.paid_until}T23:59:59`);
    if (!Number.isNaN(until.getTime()) && until.getTime() < now.getTime()) {
      return { level: ACCESS.READ_ONLY, reason: 'תוקף המנוי פג. הנתונים נשמרים וזמינים לצפייה.' };
    }
  }
  return { level: ACCESS.FULL, reason: '' };
}

/* ───────── האטת ניחוש סיסמאות ───────── */

export function loginLockState(row, now = new Date()) {
  if (!row?.locked_until) return { locked: false };
  const until = new Date(row.locked_until);
  if (Number.isNaN(until.getTime()) || until.getTime() <= now.getTime()) return { locked: false };
  const minutes = Math.ceil((until.getTime() - now.getTime()) / 60000);
  return { locked: true, minutes };
}

export function nextLockState(failures, now = new Date()) {
  const next = failures + 1;
  if (next < MAX_FAILED_LOGINS) return { failures: next, lockedUntil: null };
  const until = new Date(now.getTime() + LOCK_MINUTES * 60000);
  return { failures: next, lockedUntil: until.toISOString() };
}

export const LIMITS = { MAX_FAILED_LOGINS, LOCK_MINUTES, SESSION_DAYS };
