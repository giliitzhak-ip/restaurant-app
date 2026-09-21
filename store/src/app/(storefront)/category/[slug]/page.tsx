import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { prisma } from '@/lib/db'
import { listCatalogProducts, listCatalogBrands } from '@/lib/catalog/queries'
import { parseCatalogParams, type RawSearchParams } from '@/lib/catalog/search-params'
import { ProductCard } from '@/components/storefront/product-card'
import { CatalogFilters } from '@/components/storefront/catalog-filters'
import { EmptyState } from '@/components/ui/empty-state'
import { ProductCardSkeleton } from '@/components/ui/skeleton'
import { breadcrumbJsonLd } from '@/lib/seo'

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<RawSearchParams>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const category = await prisma.category.findUnique({ where: { slug } })
  if (!category) return { title: 'קטגוריה לא נמצאה' }
  return {
    title: category.metaTitle ?? category.name,
    description: category.metaDescription ?? category.description ?? undefined,
    alternates: { canonical: `/category/${category.slug}` },
  }
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const raw = await searchParams

  const category = await prisma.category.findFirst({
    where: { slug, isActive: true },
    include: {
      parent: { select: { slug: true, name: true } },
      children: { where: { isActive: true }, orderBy: { position: 'asc' }, select: { slug: true, name: true } },
    },
  })
  if (!category) notFound()

  const filters = parseCatalogParams(raw, slug)
  const [result, brands] = await Promise.all([listCatalogProducts(filters), listCatalogBrands()])

  const crumbs = [
    { name: 'בית', url: '/' },
    ...(category.parent ? [{ name: category.parent.name, url: `/category/${category.parent.slug}` }] : []),
    { name: category.name, url: `/category/${category.slug}` },
  ]

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(crumbs)) }}
      />

      <nav aria-label="מסלול ניווט" className="text-xs text-ink-500">
        <ol className="flex flex-wrap items-center gap-1.5">
          {crumbs.map((crumb, index) => (
            <li key={crumb.url} className="flex items-center gap-1.5">
              {index > 0 && <span aria-hidden>/</span>}
              {index === crumbs.length - 1 ? (
                <span aria-current="page" className="font-medium text-ink-700">{crumb.name}</span>
              ) : (
                <Link href={crumb.url} className="hover:text-brand-700">{crumb.name}</Link>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <header className="mt-4">
        <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">{category.name}</h1>
        {category.description && <p className="mt-2 max-w-2xl text-sm text-ink-500">{category.description}</p>}
      </header>

      {category.children.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-2">
          {category.children.map((child) => (
            <li key={child.slug}>
              <Link
                href={`/category/${child.slug}`}
                className="inline-flex rounded-pill border border-ink-200 bg-white px-3.5 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:border-brand-300 hover:bg-brand-50"
              >
                {child.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_1fr]">
        <Suspense fallback={<div className="h-64" />}>
          <CatalogFilters brands={brands} />
        </Suspense>

        <div>
          <p className="text-sm text-ink-500" aria-live="polite">
            {result.total} מוצרים
          </p>

          {result.items.length === 0 ? (
            <EmptyState
              className="mt-6"
              title="לא נמצאו מוצרים"
              description="נסו להסיר חלק מהמסננים, או לחפש לפי שם המוצר."
            />
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {result.items.map((product, index) => (
                <ProductCard key={product.id} product={product} priority={index < 4} />
              ))}
            </div>
          )}

          {result.pageCount > 1 && (
            <nav aria-label="דפדוף" className="mt-10 flex items-center justify-center gap-2">
              {Array.from({ length: result.pageCount }, (_, i) => i + 1).map((page) => {
                const next = new URLSearchParams(
                  Object.entries(raw).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as [string, string]] : [])),
                )
                next.set('page', String(page))
                return (
                  <Link
                    key={page}
                    href={`/category/${slug}?${next.toString()}`}
                    aria-current={page === result.page ? 'page' : undefined}
                    className={
                      page === result.page
                        ? 'flex size-9 items-center justify-center rounded-lg bg-brand-700 text-sm font-semibold text-white'
                        : 'flex size-9 items-center justify-center rounded-lg border border-ink-200 text-sm text-ink-700 hover:bg-ink-100'
                    }
                  >
                    {page}
                  </Link>
                )
              })}
            </nav>
          )}
        </div>
      </div>
    </div>
  )
}

export function Loading() {
  return (
    <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-10 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  )
}
