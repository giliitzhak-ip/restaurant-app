'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { logoutAction } from '@/app/actions/auth'

export function LogoutButton() {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await logoutAction()
          router.push('/admin/login')
          router.refresh()
        })
      }
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-100"
    >
      <LogOut className="size-3.5" aria-hidden />
      יציאה
    </button>
  )
}
