'use server'

import { headers } from 'next/headers'
import { prisma } from '@/lib/db'
import { verifyPassword } from '@/lib/auth/password'
import { clearSessionCookie, setSessionCookie, getSession } from '@/lib/auth/session'
import { rateLimit } from '@/lib/auth/rate-limit'
import { recordAudit } from '@/lib/audit'

const MAX_FAILED_LOGINS = 5
const LOCK_MINUTES = 15

export interface LoginResult {
  ok: boolean
  error?: string
}

/** Constant user-facing message — never reveal whether the email exists. */
const GENERIC_ERROR = 'שם המשתמש או הסיסמה שגויים'

export async function loginAction(formData: FormData): Promise<LoginResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  if (!email || !password) return { ok: false, error: GENERIC_ERROR }

  const headerList = await headers()
  const ip = headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  if (!rateLimit(`login:ip:${ip}`, 20, 600).allowed || !rateLimit(`login:email:${email}`, 8, 600).allowed) {
    return { ok: false, error: 'יותר מדי ניסיונות התחברות. נסו שוב בעוד מספר דקות.' }
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !user.isActive) return { ok: false, error: GENERIC_ERROR }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, error: 'החשבון נעול זמנית בעקבות ניסיונות כושלים. נסו שוב מאוחר יותר.' }
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    const failedLogins = user.failedLogins + 1
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins,
        lockedUntil: failedLogins >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    })
    await recordAudit({ action: 'auth.login_failed', entity: 'User', entityId: user.id, actorEmail: email, ip })
    return { ok: false, error: GENERIC_ERROR }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
  })
  await setSessionCookie({ userId: user.id, email: user.email, name: user.name, role: user.role })
  await recordAudit({ action: 'auth.login', entity: 'User', entityId: user.id, userId: user.id, actorEmail: email, ip })

  return { ok: true }
}

export async function logoutAction(): Promise<void> {
  const session = await getSession()
  if (session) {
    await recordAudit({ action: 'auth.logout', entity: 'User', entityId: session.userId, userId: session.userId, actorEmail: session.email })
  }
  await clearSessionCookie()
}
