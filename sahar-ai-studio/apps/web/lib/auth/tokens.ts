import { createHash, randomBytes } from 'node:crypto';

export { SESSION_COOKIE } from './constants';

/** 256-bit random token, URL-safe. Only ever sent to the browser in an HttpOnly cookie. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** What is stored in the database: a leaked database row cannot be replayed as a cookie. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isWellFormedToken(token: string | undefined): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}
