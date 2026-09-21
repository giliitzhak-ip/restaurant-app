import { prisma } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'
import { pickRendition } from '@/lib/media/renditions'
import { discountPercent, effectivePrice } from '@/lib/money'

/**
 * The only filter the storefront may use. Anything not PUBLISHED, not flagged
 * published, or priced at null never leaves the admin.
 */
export const PUBLIC_PRODUCT_WHERE: Prisma.ProductWhereInput = {
  status: 'PUBLISHED',
  published: true,
  price: { not: null },
  NOT: { regulatory: { status: { in: ['PROFESSIONAL_ONLY', 'BLOCKED', 'EXPIRED', 'REQUIRES_VERIFICATION'] } } },
}

export const productCardSelect = {
  id: true,
  slug: true,
  name: true,
  brand: true,
  shortDescription: true,
  price: true,
  salePrice: true,
  currency: true,
  isBestSeller: true,
  isNew: true,
  poisonFree: true,
  stockPolicy: true,
  status: true,
  published: true,
  inventory: { select: { onHand: true, reserved: true } },
  categories: {
    where: { isPrimary: true },
    take: 1,
    select: { category: { select: { name: true, slug: true } } },
  },
  media: {
    orderBy: [{ isMain: 'desc' }, { position: 'asc' }] as const,
    take: 1,
    select: { alt: true, media: { select: { url: true, alt: true, variants: true } } },
  },
} satisfies Prisma.ProductSelect

export type ProductCardRow = Prisma.ProductGetPayload<{ select: typeof productCardSelect }>

export interface ProductCardView {
  id: string
  slug: string
  name: string
  brand: string | null
  shortDescription: string | null
  categoryName: string | null
  imageUrl: string | null
  imageAlt: string
  price: number | null
  salePrice: number | null
  finalPrice: number | null
  discount: number | null
  currency: string
  isBestSeller: boolean
  isNew: boolean
  poisonFree: boolean
  inStock: boolean
  isPublished: boolean
}

export function toCardView(row: ProductCardRow): ProductCardView {
  const link = row.media[0]
  const available = (row.inventory?.onHand ?? 0) - (row.inventory?.reserved ?? 0)
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    shortDescription: row.shortDescription,
    categoryName: row.categories[0]?.category.name ?? null,
    imageUrl: link ? pickRendition(link.media.variants, 'card', link.media.url) : null,
    imageAlt: link?.alt || link?.media.alt || row.name,
    price: row.price,
    salePrice: row.salePrice,
    finalPrice: effectivePrice(row.price, row.salePrice),
    discount: discountPercent(row.price, row.salePrice),
    currency: row.currency,
    isBestSeller: row.isBestSeller,
    isNew: row.isNew,
    poisonFree: row.poisonFree,
    inStock: available > 0 || row.stockPolicy === 'ALLOW_BACKORDER',
    isPublished: row.published && row.status === 'PUBLISHED',
  }
}

export interface CatalogFilters {
  categorySlug?: string
  search?: string
  minPrice?: number
  maxPrice?: number
  brands?: string[]
  environment?: 'INDOOR' | 'OUTDOOR'
  poisonFree?: boolean
  readyToUse?: boolean
  bestSeller?: boolean
  isNew?: boolean
  onSale?: boolean
  inStockOnly?: boolean
  sort?: 'recommended' | 'popular' | 'price_asc' | 'price_desc' | 'newest'
  page?: number
  pageSize?: number
}

function orderFor(sort: CatalogFilters['sort']): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'price_asc': return [{ price: 'asc' }, { name: 'asc' }]
    case 'price_desc': return [{ price: 'desc' }, { name: 'asc' }]
    case 'newest': return [{ publishedAt: 'desc' }, { createdAt: 'desc' }]
    case 'popular': return [{ isBestSeller: 'desc' }, { position: 'asc' }, { name: 'asc' }]
    default: return [{ position: 'asc' }, { isBestSeller: 'desc' }, { name: 'asc' }]
  }
}

export function buildCatalogWhere(filters: CatalogFilters): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [PUBLIC_PRODUCT_WHERE]

  if (filters.categorySlug) {
    and.push({
      categories: {
        some: {
          category: {
            OR: [{ slug: filters.categorySlug }, { parent: { slug: filters.categorySlug } }],
          },
        },
      },
    })
  }
  if (filters.search) and.push(searchWhere(filters.search))
  if (filters.minPrice !== undefined) and.push({ price: { gte: filters.minPrice } })
  if (filters.maxPrice !== undefined) and.push({ price: { lte: filters.maxPrice } })
  if (filters.brands?.length) and.push({ brand: { in: filters.brands } })
  if (filters.environment) and.push({ environment: { in: [filters.environment, 'BOTH'] } })
  if (filters.poisonFree) and.push({ poisonFree: true })
  if (filters.readyToUse) and.push({ readyToUse: true })
  if (filters.bestSeller) and.push({ isBestSeller: true })
  if (filters.isNew) and.push({ isNew: true })
  if (filters.onSale) and.push({ salePrice: { not: null } })
  if (filters.inStockOnly) and.push({ inventory: { onHand: { gt: 0 } } })

  return { AND: and }
}

/** Name / SKU / brand / keyword / pest search. */
export function searchWhere(term: string): Prisma.ProductWhereInput {
  const q = term.trim()
  return {
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { nameEn: { contains: q, mode: 'insensitive' } },
      { sku: { contains: q, mode: 'insensitive' } },
      { barcode: { contains: q, mode: 'insensitive' } },
      { brand: { contains: q, mode: 'insensitive' } },
      { shortDescription: { contains: q, mode: 'insensitive' } },
      { keywords: { has: q } },
      { keywords: { hasSome: q.split(/\s+/).filter(Boolean) } },
      { categories: { some: { category: { name: { contains: q, mode: 'insensitive' } } } } },
      { regulatory: { targetPests: { hasSome: q.split(/\s+/).filter(Boolean) } } },
    ],
  }
}

export async function listCatalogProducts(filters: CatalogFilters) {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(60, Math.max(1, filters.pageSize ?? 24))
  const where = buildCatalogWhere(filters)

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: productCardSelect,
      orderBy: orderFor(filters.sort),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ])

  return {
    items: rows.map(toCardView),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function getPublishedProductBySlug(slug: string) {
  return prisma.product.findFirst({
    where: { ...PUBLIC_PRODUCT_WHERE, slug },
    include: {
      media: { orderBy: [{ isMain: 'desc' }, { position: 'asc' }], include: { media: true } },
      categories: { include: { category: true } },
      inventory: true,
      regulatory: true,
      variants: { where: { isActive: true }, orderBy: { position: 'asc' } },
      reviews: { where: { status: 'APPROVED' }, orderBy: { createdAt: 'desc' }, take: 20 },
    },
  })
}

export async function listCatalogBrands(): Promise<string[]> {
  const rows = await prisma.product.findMany({
    where: { ...PUBLIC_PRODUCT_WHERE, brand: { not: null } },
    select: { brand: true },
    distinct: ['brand'],
    orderBy: { brand: 'asc' },
  })
  return rows.map((r) => r.brand!).filter(Boolean)
}
