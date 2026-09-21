import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { parseOptions, solve, type SolverQuestionView } from '@/lib/solver/service'
import { SolverWizard } from '@/components/storefront/solver-wizard'

interface PageProps {
  params: Promise<{ pest: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { pest } = await params
  const record = await prisma.solverPest.findUnique({ where: { slug: pest } })
  if (!record) return { title: 'לא נמצא' }
  return {
    title: `פתרון ל${record.name}`,
    description: record.intro ?? undefined,
    alternates: { canonical: `/solver/${record.slug}` },
  }
}

export default async function SolverPestPage({ params, searchParams }: PageProps) {
  const { pest } = await params
  const raw = await searchParams

  const record = await prisma.solverPest.findFirst({
    where: { slug: pest, isActive: true },
    include: { questions: { orderBy: { position: 'asc' } } },
  })
  if (!record) notFound()

  const questions: SolverQuestionView[] = record.questions.map((q) => ({
    key: q.key,
    prompt: q.prompt,
    options: parseOptions(q.options),
  }))

  const answers: Record<string, string> = {}
  for (const question of questions) {
    const value = raw[question.key]
    if (typeof value === 'string') answers[question.key] = value
  }

  const complete = questions.every((q) => answers[q.key])
  const tags = complete
    ? questions.flatMap((q) => q.options.find((o) => o.value === answers[q.key])?.tags ?? [])
    : []

  const result = complete ? await solve(record.slug, tags) : null

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">{record.name}</h1>
      {record.intro && <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-600">{record.intro}</p>}

      <SolverWizard
        pestSlug={record.slug}
        questions={questions}
        answers={answers}
        result={result}
      />
    </div>
  )
}
