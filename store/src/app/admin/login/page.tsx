import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { LoginForm } from '@/components/admin/login-form'

export const metadata: Metadata = { title: 'כניסת מנהלים', robots: { index: false, follow: false } }

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await getSession()
  const { next } = await searchParams
  if (session) redirect(next && next.startsWith('/admin') ? next : '/admin')

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
      <div className="w-full max-w-sm rounded-card border border-ink-200 bg-white p-7 shadow-soft">
        <h1 className="text-xl font-bold text-ink-900">כניסה למערכת הניהול</h1>
        <p className="mt-1.5 text-sm text-ink-500">האזור מיועד לצוות בלבד.</p>
        <LoginForm nextPath={next && next.startsWith('/admin') ? next : '/admin'} />
      </div>
    </div>
  )
}
