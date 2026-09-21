import Link from 'next/link'
import { prisma } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'
import { requireAdminPage } from '@/lib/auth/guard'
import { PageHeader } from '@/components/admin/page-header'
import { ProductRow } from '@/components/admin/product-row'
import { pickRendition } from '@/lib/media/renditions'
import { PRODUCT_STATUS_LABELS } from '@/lib/catalog/status'
import { EmptyState } from '@/components/ui/empty-state'

const STATUS_FILTERS = ['ALL', 'DRAFT', 'READY_FOR_REVIEW', 'REQUIRES_VERIFICATION', 'READY_TO_PUBLISH', 'PUBLISHED', 'ARCHIVED'] as const

interface PageProps {
  searchParams: Promise<{ q?: string; status?: string; missing?: string; supplier?: string }>
}

export default async function AdminProductsPage({ searchParams }: PageProps) {
  await requireAdminPage('products.view')
  const { q, status, missing, supplier } = await searchParams

  const where: Prisma.ProductWhereInput = {}
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { sku: { contains: q, mode: 'insensitive' } },
      { barcode: { contains: q, mode: 'insensitive' } },
      { brand: { contains: q, mode: 'insensitive' } },
    ]
  }
  if (status && status !== 'ALL') where.status = status as Prisma.ProductWhereInput['status']
  if (missing === 'media') where.media = { none: {} }
  if (missing === 'price') where.price = null
  if (supplier) where.supplierLinks = { some: { supplier: { code: supplier } } }

  const products = await prisma.product.findMany({
    where,
    orderBy: [{ status: 'asc' }, { position: 'asc' }, { createdAt: 'desc' }],
    take: 200,
    select: {
      id: true, slug: true, name: true, sku: true, brand: true,
      price: true, salePrice: true, costPrice: true, status: true, published: true, isDemoData: true,
      inventory: { select: { onHand: true, reserved: true } },
      regulatory: { select: { status: true } },
      media: {
        orderBy: [{ isMain: 'desc' }, { position: 'asc' }],
        take: 1,
        select: { media: { select: { url: true, variants: true } } },
      },
      _count: { select: { media: true } },
    },
  })

  const counts = await prisma.product.groupBy({ by: ['status'], _count: true })
  const countFor = (key: string) =>
    key === 'ALL'
      ? counts.reduce((sum, row) => sum + row._count, 0)
      : counts.find((row) => row.status === key)?._count ?? 0

  return (
    <>
      <PageHeader
        title="מוצרים"
        description="עריכה מהירה של מחיר, מלאי, סטטוס ותמונה ראשית — בלי להיכנס לכל מוצר."
        action={
          <Link href="/admin/media/import" className="text-sm font-semibold text-brand-700 hover:underline">
            ייבוא תמונות מרוכז ←
          </Link>
        }
      />

      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <label htmlFor="admin-product-search" className="sr-only">חיפוש מוצר</label>
        <input
          id="admin-product-search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="שם, מק״ט, ברקוד או מותג"
          className="h-10 w-full max-w-xs rounded-xl border border-ink-200 px-3 text-sm"
        />
        <input type="hidden" name="status" value={status ?? 'ALL'} />
        <button type="submit" className="h-10 rounded-xl bg-ink-900 px-4 text-sm font-medium text-white">חיפוש</button>
      </form>

      <nav aria-label="סינון לפי סטטוס" className="mb-5 flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((key) => {
          const active = (status ?? 'ALL') === key
          return (
            <Link
              key={key}
              href={`/admin/products?status=${key}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'rounded-pill bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white'
                  : 'rounded-pill border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-100'
              }
            >
              {key === 'ALL' ? 'הכל' : PRODUCT_STATUS_LABELS[key]} ({countFor(key)})
            </Link>
          )
        })}
      </nav>

      {products.length === 0 ? (
        <EmptyState title="לא נמצאו מוצרים" description="נסו לשנות את הסינון או את מונח החיפוש." />
      ) : (
        <div className="overflow-hidden rounded-card border border-ink-200 bg-white">
          <ul className="divide-y divide-ink-100">
            {products.map((product) => (
              <ProductRow
                key={product.id}
                product={{
                  id: product.id,
                  name: product.name,
                  slug: product.slug,
                  sku: product.sku,
                  brand: product.brand,
                  price: product.price,
                  salePrice: product.salePrice,
                  costPrice: product.costPrice,
                  status: product.status,
                  published: product.published,
                  isDemoData: product.isDemoData,
                  regulatoryStatus: product.regulatory?.status ?? null,
                  stock: product.inventory?.onHand ?? null,
                  mediaCount: product._count.media,
                  thumbnailUrl: product.media[0]
                    ? pickRendition(product.media[0].media.variants, 'thumbnail', product.media[0].media.url)
                    : null,
                }}
              />
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
