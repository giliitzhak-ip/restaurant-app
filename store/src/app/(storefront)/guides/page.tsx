import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import { EmptyState } from '@/components/ui/empty-state'

export const metadata: Metadata = {
  title: 'מדריכים',
  description: 'מדריכים מעשיים לבית, לגינה ולמניעת מזיקים.',
  alternates: { canonical: '/guides' },
}

export default async function GuidesPage() {
  const guides = await prisma.contentPage.findMany({
    where: { kind: 'GUIDE', published: true },
    orderBy: { position: 'asc' },
  })

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">מדריכים</h1>
      <p className="mt-2 text-sm text-ink-600">תוכן מקצועי נכתב ונבדק לפני פרסום.</p>

      {guides.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="המדריכים בהכנה"
          description="התוכן נכתב כעת ויפורסם לאחר בדיקה מקצועית."
        />
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {guides.map((guide) => (
            <li key={guide.id}>
              <Link href={`/page/${guide.slug}`} className="block rounded-card border border-ink-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:shadow-lift">
                <h2 className="text-base font-bold text-ink-900">{guide.title}</h2>
                {guide.excerpt && <p className="mt-2 text-sm text-ink-500">{guide.excerpt}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
