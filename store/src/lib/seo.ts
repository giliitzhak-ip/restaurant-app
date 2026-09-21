const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString()
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  }
}

export function organizationJsonLd(name: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name,
    url: SITE_URL,
  }
}

export interface ProductJsonLdInput {
  name: string
  description: string | null
  slug: string
  sku: string | null
  brand: string | null
  image: string[]
  price: number | null
  currency: string
  inStock: boolean
  ratingValue?: number
  reviewCount?: number
}

export function productJsonLd(input: ProductJsonLdInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    description: input.description ?? undefined,
    sku: input.sku ?? undefined,
    brand: input.brand ? { '@type': 'Brand', name: input.brand } : undefined,
    image: input.image.map((src) => (src.startsWith('http') ? src : absoluteUrl(src))),
    offers: input.price === null ? undefined : {
      '@type': 'Offer',
      url: absoluteUrl(`/product/${input.slug}`),
      priceCurrency: input.currency,
      price: (input.price / 100).toFixed(2),
      availability: input.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
    aggregateRating:
      input.ratingValue && input.reviewCount
        ? { '@type': 'AggregateRating', ratingValue: input.ratingValue, reviewCount: input.reviewCount }
        : undefined,
  }
}

export function faqJsonLd(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }
}
