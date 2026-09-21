import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { prisma } from '@/lib/db'

export const metadata: Metadata = {
  title: 'מצאו פתרון לבעיה',
  description: 'ענו על כמה שאלות קצרות ונוביל אתכם לפתרון המתאים לבית ולגינה.',
  alternates: { canonical: '/solver' },
}

export default async function SolverIndexPage() {
  const pests = await prisma.solverPest.findMany({ where: { isActive: true }, orderBy: { position: 'asc' } })

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">מה הבעיה אצלכם?</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-600">
        לא צריך לדעת באיזה חומר מדובר. בחרו את הבעיה, ענו על שתיים-שלוש שאלות ונציג לכם את הפתרונות המתאימים.
      </p>

      <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pests.map((pest) => (
          <li key={pest.id}>
            <Link
              href={`/solver/${pest.slug}`}
              className="group flex h-full flex-col rounded-card border border-ink-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lift"
            >
              <span className="text-base font-bold text-ink-900">{pest.name}</span>
              {pest.intro && <span className="mt-1.5 text-xs leading-relaxed text-ink-500">{pest.intro}</span>}
              <span className="mt-auto flex items-center gap-1 pt-4 text-sm font-semibold text-brand-700">
                התחלה
                <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
