import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { withSystem } from './db';

const scrypt = promisify(scryptCallback);

export const SESSION_COOKIE = 'gs_session';
const SESSION_TTL_DAYS = 30;

export type UserRole = 'customer' | 'provider' | 'admin';

export interface AuthenticatedUser {
  readonly id: string;
  readonly role: UserRole;
  readonly fullName: string;
  readonly email: string | null;
  readonly phone: string | null;
}

/* ─────────────────────────── Password hashing ─────────────────────────── */

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString('hex')}`;
}

/** Constant-time password check. Returns false for any malformed hash. */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const salt = parts[4];
  const expectedHex = parts[5];
  if (!salt || !expectedHex) return false;

  try {
    const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
    const expected = Buffer.from(expectedHex, 'hex');
    if (expected.length !== derived.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/* ─────────────────────────────── Sessions ─────────────────────────────── */

/**
 * Only the SHA-256 hash of a session token is stored, so a database leak
 * yields no usable sessions (spec §45).
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface CreatedSession {
  readonly token: string;
  readonly expiresAt: Date;
}

export async function createSession(
  userId: string,
  userAgent?: string | null,
): Promise<CreatedSession> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

  // Session storage is trusted server work: at this point there is no
  // authenticated user yet, so RLS on user_sessions cannot apply.
  await withSystem(async (db) => {
    await db.query(
      `insert into user_sessions (user_id, token_hash, user_agent, expires_at)
       values ($1, $2, $3, $4)`,
      [userId, hashToken(token), userAgent ?? null, expiresAt],
    );
  });

  return { token, expiresAt };
}

interface SessionRow {
  user_id: string;
  role: UserRole;
  full_name: string;
  email: string | null;
  phone: string | null;
}

/** Resolve a raw token to a user, or null if invalid, expired or revoked. */
export async function resolveSessionToken(token: string): Promise<AuthenticatedUser | null> {
  if (!token) return null;

  const row = await withSystem((db) =>
    db.one<SessionRow>(
      `select s.user_id, p.role, p.full_name, p.email, p.phone
         from user_sessions s
         join profiles p on p.id = s.user_id
        where s.token_hash = $1
          and s.revoked_at is null
          and s.expires_at > now()
        limit 1`,
      [hashToken(token)],
    ),
  );

  if (!row) return null;
  return {
    id: row.user_id,
    role: row.role,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
  };
}

export async function revokeSession(token: string): Promise<void> {
  await withSystem(async (db) => {
    await db.query(
      `update user_sessions set revoked_at = now() where token_hash = $1 and revoked_at is null`,
      [hashToken(token)],
    );
  });
}

/* ──────────────────────── Request-scoped helpers ──────────────────────── */

/** The signed-in user for this request, or null. */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return resolveSessionToken(token);
}

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = 'נדרשת התחברות') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = 'אין לך הרשאה לפעולה הזו') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Require a signed-in user.
 *
 * This is a convenience for route handlers, NOT the security boundary: the
 * real enforcement is RLS in the database (spec §23, §45). A bug here cannot
 * grant access to another user's rows.
 */
export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requireRole(...roles: readonly UserRole[]): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new ForbiddenError();
  return user;
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  };
}
