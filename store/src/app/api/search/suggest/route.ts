import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { PUBLIC_PRODUCT_WHERE, searchWhere } from '@/lib/catalog/queries'
import { rateLimit } from '@/lib/auth/rate-limit'

export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon'
  const limit = rateLimit(`suggest:${ip}`, 60, 60)
  if (!limit.allowed) {
    return NextResponse.json({ items: [] }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })
  }

  const q = new URL(request.url).searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ items: [] })

  const rows = await prisma.product.findMany({
    where: { AND: [PUBLIC_PRODUCT_WHERE, searchWhere(q)] },
    select: {
      slug: true,
      name: true,
      categories: { where: { isPrimary: true }, take: 1, select: { category: { select: { name: true } } } },
    },
    take: 8,
  })

  return NextResponse.json({
    items: rows.map((r) => ({ slug: r.slug, name: r.name, categoryName: r.categories[0]?.category.name ?? null })),
  })
}
