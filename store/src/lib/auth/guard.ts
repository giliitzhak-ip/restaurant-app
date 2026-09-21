import { redirect } from 'next/navigation'
import { getSession, type AdminSession } from '@/lib/auth/session'
import { can, type Permission } from '@/lib/auth/rbac'

export class ForbiddenError extends Error {
  constructor(message = 'אין לך הרשאה לבצע פעולה זו') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

/** Server-side gate for admin pages. Redirects unauthenticated visitors. */
export async function requireAdminPage(permission?: Permission): Promise<AdminSession> {
  const session = await getSession()
  if (!session) redirect('/admin/login')
  if (permission && !can(session.role, permission)) redirect('/admin?denied=1')
  return session
}

/** Server-side gate for route handlers and server actions. Throws instead of redirecting. */
export async function requireAdmin(permission?: Permission): Promise<AdminSession> {
  const session = await getSession()
  if (!session) throw new ForbiddenError('נדרשת התחברות')
  if (permission && !can(session.role, permission)) throw new ForbiddenError()
  return session
}
