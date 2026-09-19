import { jwtVerify } from 'jose';
import type { ServerConfig } from './config';

/**
 * אימות ה-JWT שמגיע מהלקוח.
 * הטוקן נחתם ע"י Supabase Auth. השרת מאמת חתימה, תוקף ו-audience,
 * ומחלץ את מזהה המשתמש. אין הסתמכות על שום ערך שהלקוח שולח בגוף הבקשה.
 */

export interface AuthenticatedUser {
  userId: string;
  email: string | null;
}

export async function verifyAccessToken(
  token: string,
  config: ServerConfig,
): Promise<AuthenticatedUser> {
  const secret = new TextEncoder().encode(config.jwtSecret);
  const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('טוקן לא תקין: חסר מזהה משתמש.');
  }
  if (payload.aud !== 'authenticated' && !(Array.isArray(payload.aud) && payload.aud.includes('authenticated'))) {
    throw new Error('טוקן לא תקין: audience שגוי.');
  }

  return { userId: payload.sub, email: typeof payload.email === 'string' ? payload.email : null };
}

/** מחלץ Bearer token מכותרת Authorization. */
export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

/**
 * הגבלת קצב פשוטה בזיכרון, לכל משתמש ולכל פעולה.
 * לפריסה עם כמה מופעים יש להחליף במונה משותף (Redis / טבלה ב-Postgres).
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  check(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    const window = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (window.length >= this.limit) {
      const oldest = window[0] ?? now;
      return { allowed: false, retryAfterSeconds: Math.ceil((this.windowMs - (now - oldest)) / 1000) };
    }
    window.push(now);
    this.hits.set(key, window);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** ניקוי תקופתי כדי שהמפה לא תגדל ללא גבול. */
  sweep(): void {
    const now = Date.now();
    for (const [key, times] of this.hits) {
      const kept = times.filter((t) => now - t < this.windowMs);
      if (kept.length === 0) this.hits.delete(key);
      else this.hits.set(key, kept);
    }
  }
}
