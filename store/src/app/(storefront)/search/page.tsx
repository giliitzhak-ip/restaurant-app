import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SearchX } from 'lucide-react'
import { listCatalogProducts, listCatalogBrands } from '@/lib/catalog/queries'
import { parseCatalogParams, type RawSearchParams } from '@/lib/catalog/search-params'
import { ProductCard } from '@/components/storefront/product-card'
import { CatalogFilters } from '@/components/storefront/catalog-filters'
import { EmptyState } from '@/components/ui/empty-state'
import { SearchBox } from '@/components/storefront/search-box'

export const metadata: Metadata = { title: 'חיפוש', robots: { index: false, follow: true } }

export default async function SearchPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams
  const query = typeof raw.q === 'string' ? raw.q : ''
  const filters = parseCatalogParams(raw)
  const [result, brands] = await Promise.all([
    query ? listCatalogProducts(filters) : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 24, pageCount: 1 }),
    listCatalogBrands(),
  ])

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">חיפוש</h1>
      <div className="mt-4 max-w-xl">
        <Suspense fallback={null}>
          <SearchBox defaultValue={query} />
        </Suspense>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_1fr]">
        <Suspense fallback={<div className="h-64" />}>
          <CatalogFilters brands={brands} />
        </Suspense>

        <div>
          {!query ? (
            <EmptyState
              icon={<SearchX className="size-8" />}
              title="התחילו לחפש"
              description="אפשר לחפש לפי שם מוצר, מותג, מק״ט או לפי הבעיה — לדוגמה ״נמלים במטבח״."
            />
          ) : result.items.length === 0 ? (
            <EmptyState
              icon={<SearchX className="size-8" />}
              title={`לא נמצאו תוצאות עבור "${query}"`}
              description="בדקו את האיות, נסו מילה אחרת, או עברו דרך אשף הפתרונות."
            />
          ) : (
            <>
              <p className="text-sm text-ink-500" aria-live="polite">{result.total} תוצאות עבור ״{query}״</p>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {result.items.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
