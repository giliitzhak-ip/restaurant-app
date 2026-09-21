import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/db'
import { PUBLIC_PRODUCT_WHERE } from '@/lib/catalog/queries'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories, pages, pests] = await Promise.all([
    prisma.product.findMany({ where: PUBLIC_PRODUCT_WHERE, select: { slug: true, updatedAt: true } }),
    prisma.category.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
    prisma.contentPage.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
    prisma.solverPest.findMany({ where: { isActive: true }, select: { slug: true } }),
  ])

  return [
    { url: SITE_URL, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/solver`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/guides`, changeFrequency: 'weekly', priority: 0.6 },
    ...pests.map((p) => ({ url: `${SITE_URL}/solver/${p.slug}`, changeFrequency: 'monthly' as const, priority: 0.6 })),
    ...categories.map((c) => ({ url: `${SITE_URL}/category/${c.slug}`, lastModified: c.updatedAt, changeFrequency: 'weekly' as const, priority: 0.8 })),
    ...products.map((p) => ({ url: `${SITE_URL}/product/${p.slug}`, lastModified: p.updatedAt, changeFrequency: 'weekly' as const, priority: 0.7 })),
    ...pages.map((p) => ({ url: `${SITE_URL}/page/${p.slug}`, lastModified: p.updatedAt, changeFrequency: 'monthly' as const, priority: 0.4 })),
  ]
}
