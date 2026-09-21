import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import type { UserRole } from '@/generated/prisma/enums'
import { getEnv, isProduction } from '@/lib/env'

export const ADMIN_SESSION_COOKIE = 'admin_session'
const MAX_AGE_SECONDS = 60 * 60 * 8

export interface AdminSession {
  userId: string
  email: string
  name: string
  role: UserRole
}

function secret(): Uint8Array {
  return new TextEncoder().encode(getEnv().AUTH_SECRET)
}

export async function createSessionToken(session: AdminSession): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('home-garden-store')
    .setAudience('admin')
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret())
}

export async function readSessionToken(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: 'home-garden-store',
      audience: 'admin',
    })
    if (!payload.userId || !payload.role) return null
    return {
      userId: String(payload.userId),
      email: String(payload.email ?? ''),
      name: String(payload.name ?? ''),
      role: payload.role as UserRole,
    }
  } catch {
    return null
  }
}

export async function setSessionCookie(session: AdminSession): Promise<void> {
  const token = await createSessionToken(session)
  const store = await cookies()
  store.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  store.delete(ADMIN_SESSION_COOKIE)
}

export async function getSession(): Promise<AdminSession | null> {
  const store = await cookies()
  const token = store.get(ADMIN_SESSION_COOKIE)?.value
  if (!token) return null
  return readSessionToken(token)
}
