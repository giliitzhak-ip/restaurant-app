import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const page = await prisma.contentPage.findUnique({ where: { slug } })
  if (!page) return { title: 'העמוד לא נמצא' }
  return {
    title: page.metaTitle ?? page.title,
    description: page.metaDescription ?? page.excerpt ?? undefined,
    alternates: { canonical: `/page/${page.slug}` },
    robots: page.published ? undefined : { index: false, follow: false },
  }
}

export default async function ContentPageView({ params }: PageProps) {
  const { slug } = await params
  const page = await prisma.contentPage.findUnique({ where: { slug } })
  if (!page) notFound()

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">{page.title}</h1>
      {!page.published && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          תוכן העמוד ממתין לעדכון על ידי בעלי החנות.
        </p>
      )}
      {page.published && page.bodyHtml && (
        <div
          className="mt-6 space-y-4 text-sm leading-relaxed text-ink-700 [&_a]:text-brand-700 [&_a]:underline [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink-900 [&_ul]:list-disc [&_ul]:ps-5"
          dangerouslySetInnerHTML={{ __html: page.bodyHtml }}
        />
      )}
    </article>
  )
}
