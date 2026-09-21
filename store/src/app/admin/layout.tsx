import type { Metadata } from 'next'
import { AdminShell } from '@/components/admin/admin-shell'
import { getSession } from '@/lib/auth/session'

export const metadata: Metadata = {
  title: { default: 'ניהול', template: '%s | ניהול' },
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  // The login page renders inside this layout before a session exists.
  if (!session) return <>{children}</>
  return <AdminShell session={session}>{children}</AdminShell>
}
