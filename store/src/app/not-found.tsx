import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <html lang="he" dir="rtl">
      <body>
        <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
          <p className="text-sm font-bold text-brand-700">404</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink-900">העמוד לא נמצא</h1>
          <p className="mt-2 max-w-sm text-sm text-ink-500">
            ייתכן שהקישור ישן או שהמוצר הוסר מהחנות.
          </p>
          <div className="mt-8 flex gap-3">
            <Link href="/"><Button>לעמוד הבית</Button></Link>
            <Link href="/search"><Button variant="outline">לחיפוש</Button></Link>
          </div>
        </main>
      </body>
    </html>
  )
}
