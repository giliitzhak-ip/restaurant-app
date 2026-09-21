'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">משהו השתבש</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-500">
        אירעה תקלה זמנית. אפשר לנסות שוב, ואם הבעיה חוזרת נשמח שתיצרו קשר.
      </p>
      <Button className="mt-8" onClick={reset}>נסו שוב</Button>
    </main>
  )
}
