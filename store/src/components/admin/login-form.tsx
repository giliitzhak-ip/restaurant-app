'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input, Field } from '@/components/ui/input'
import { loginAction } from '@/app/actions/auth'

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        startTransition(async () => {
          const result = await loginAction(formData)
          if (result.ok) {
            router.push(nextPath)
            router.refresh()
          } else {
            setError(result.error ?? 'אירעה שגיאה')
          }
        })
      }}
    >
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}

      <Field label="אימייל" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required dir="ltr" />
      </Field>
      <Field label="סיסמה" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required dir="ltr" />
      </Field>

      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? 'מתחבר…' : 'כניסה'}
      </Button>
    </form>
  )
}
