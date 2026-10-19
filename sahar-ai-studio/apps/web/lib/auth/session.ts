import 'server-only';
import { prisma } from '@sahar/db';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getServerEnv } from '../env';
import { SessionStore, type SessionMeta, type SessionUser } from './session-store';
import { SESSION_COOKIE } from './constants';

export function getSessionStore() {
  return new SessionStore(prisma, getServerEnv().SESSION_TTL_DAYS);
}

function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: getServerEnv().NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  };
}

/** Creates a session and sets the cookie. Call only from Server Actions / Route Handlers. */
export async function startSession(userId: string, meta: SessionMeta) {
  const { token, expiresAt } = await getSessionStore().create(userId, meta);
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

export async function endSession() {
  const jar = await cookies();
  await getSessionStore().revoke(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
}

/** Current user from the session cookie, validated against the database. Cached per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const result = await getSessionStore().validate(token);
  return result?.user ?? null;
});

/** Authoritative guard for pages, layouts, actions and route handlers. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}
