import type { CatalogFilters } from './queries'

export type RawSearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function intOrUndefined(value: string | undefined): number | undefined {
  if (!value) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) : undefined
}

const SORTS = new Set(['recommended', 'popular', 'price_asc', 'price_desc', 'newest'])

/** Turns untrusted query strings into a validated filter object. */
export function parseCatalogParams(params: RawSearchParams, categorySlug?: string): CatalogFilters {
  const sort = first(params.sort)
  const brand = first(params.brand)
  const environment = first(params.environment)
  const minShekels = intOrUndefined(first(params.minPrice))
  const maxShekels = intOrUndefined(first(params.maxPrice))

  return {
    categorySlug,
    search: first(params.q)?.slice(0, 120),
    minPrice: minShekels !== undefined ? minShekels * 100 : undefined,
    maxPrice: maxShekels !== undefined ? maxShekels * 100 : undefined,
    brands: brand ? [brand] : undefined,
    environment: environment === 'INDOOR' || environment === 'OUTDOOR' ? environment : undefined,
    poisonFree: first(params.poisonFree) === '1',
    readyToUse: first(params.readyToUse) === '1',
    bestSeller: first(params.bestSeller) === '1',
    isNew: first(params.new) === '1',
    onSale: first(params.sale) === '1',
    inStockOnly: first(params.inStock) === '1',
    sort: sort && SORTS.has(sort) ? (sort as CatalogFilters['sort']) : 'recommended',
    page: Math.max(1, intOrUndefined(first(params.page)) ?? 1),
  }
}
