import { prisma } from '@/lib/db'
import { PUBLIC_PRODUCT_WHERE, productCardSelect, toCardView, type ProductCardView } from '@/lib/catalog/queries'

export interface SolverOption {
  value: string
  label: string
  tags: string[]
}

export interface SolverQuestionView {
  key: string
  prompt: string
  options: SolverOption[]
}

export function parseOptions(value: unknown): SolverOption[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const record = entry as Record<string, unknown>
    if (typeof record.value !== 'string' || typeof record.label !== 'string') return []
    return [{
      value: record.value,
      label: record.label,
      tags: Array.isArray(record.tags) ? record.tags.filter((t): t is string => typeof t === 'string') : [],
    }]
  })
}

export interface SolverResult {
  recommended: ProductCardView[]
  complementary: ProductCardView[]
  /** True when the answers suggest the problem is beyond a DIY solution. */
  needsProfessional: boolean
}

/**
 * Recommendations come from admin-curated matches and from the pest's own
 * category — both filtered through PUBLIC_PRODUCT_WHERE, so an unverified
 * product can never be recommended.
 */
export async function solve(pestSlug: string, tags: string[]): Promise<SolverResult> {
  const pest = await prisma.solverPest.findUnique({
    where: { slug: pestSlug },
    include: {
      matches: {
        include: { product: { select: productCardSelect } },
        orderBy: { weight: 'desc' },
      },
    },
  })

  const needsProfessional = tags.includes('professional-check')
  if (!pest) return { recommended: [], complementary: [], needsProfessional }

  const tagSet = new Set(tags)
  const curated = pest.matches.filter((match) => match.requiredTags.every((t) => tagSet.has(t)))

  const curatedIds = new Set(curated.map((m) => m.productId))
  const publishedCurated = await prisma.product.findMany({
    where: { ...PUBLIC_PRODUCT_WHERE, id: { in: [...curatedIds] } },
    select: productCardSelect,
  })
  const publishedIds = new Set(publishedCurated.map((p) => p.id))

  const recommended = curated
    .filter((m) => m.role === 'RECOMMENDED' && publishedIds.has(m.productId))
    .map((m) => toCardView(m.product))
  const complementary = curated
    .filter((m) => m.role === 'COMPLEMENTARY' && publishedIds.has(m.productId))
    .map((m) => toCardView(m.product))

  // Fall back to the matching category when no curated match is published yet.
  if (recommended.length === 0) {
    const fallback = await prisma.product.findMany({
      where: {
        ...PUBLIC_PRODUCT_WHERE,
        categories: { some: { category: { slug: pestSlug } } },
      },
      select: productCardSelect,
      take: 8,
    })
    return { recommended: fallback.map(toCardView), complementary, needsProfessional }
  }

  return { recommended, complementary, needsProfessional }
}
