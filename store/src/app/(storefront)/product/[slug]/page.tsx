import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ShieldCheck, Truck, RotateCcw } from 'lucide-react'
import { prisma } from '@/lib/db'
import { getPublishedProductBySlug, PUBLIC_PRODUCT_WHERE, productCardSelect, toCardView } from '@/lib/catalog/queries'
import { pickRendition } from '@/lib/media/renditions'
import { discountPercent, effectivePrice, formatAgorot } from '@/lib/money'
import { ProductGallery, type GalleryImage } from '@/components/storefront/product-gallery'
import { ProductCard } from '@/components/storefront/product-card'
import { AddToCart } from '@/components/storefront/add-to-cart'
import { Badge } from '@/components/ui/badge'
import { breadcrumbJsonLd, productJsonLd } from '@/lib/seo'
import { isRegulatedKind } from '@/lib/catalog/status'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const product = await getPublishedProductBySlug(slug)
  if (!product) return { title: 'המוצר לא נמצא' }
  return {
    title: product.metaTitle ?? product.name,
    description: product.metaDescription ?? product.shortDescription ?? undefined,
    alternates: { canonical: `/product/${product.slug}` },
    openGraph: {
      title: product.name,
      description: product.shortDescription ?? undefined,
      images: product.media[0] ? [pickRendition(product.media[0].media.variants, 'page', product.media[0].media.url)] : [],
    },
  }
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params
  const product = await getPublishedProductBySlug(slug)
  if (!product) notFound()

  const images: GalleryImage[] = product.media.map((link) => ({
    id: link.id,
    url: pickRendition(link.media.variants, 'page', link.media.url),
    zoomUrl: pickRendition(link.media.variants, 'zoom', link.media.url),
    thumbUrl: pickRendition(link.media.variants, 'thumbnail', link.media.url),
    alt: link.alt || link.media.alt || product.name,
  }))

  const price = effectivePrice(product.price, product.salePrice)
  const discount = discountPercent(product.price, product.salePrice)
  const available = (product.inventory?.onHand ?? 0) - (product.inventory?.reserved ?? 0)
  const inStock = available > 0 || product.stockPolicy === 'ALLOW_BACKORDER'
  const primaryCategory = product.categories.find((c) => c.isPrimary)?.category ?? product.categories[0]?.category

  const related = primaryCategory
    ? (
        await prisma.product.findMany({
          where: {
            ...PUBLIC_PRODUCT_WHERE,
            id: { not: product.id },
            categories: { some: { categoryId: primaryCategory.id } },
          },
          select: productCardSelect,
          take: 4,
        })
      ).map(toCardView)
    : []

  const reg = product.regulatory
  // Regulatory copy is rendered only from fields that passed verification.
  const showRegulatorySection =
    isRegulatedKind(product.kind) && reg?.status === 'VERIFIED_PUBLIC_USE'

  const crumbs = [
    { name: 'בית', url: '/' },
    ...(primaryCategory ? [{ name: primaryCategory.name, url: `/category/${primaryCategory.slug}` }] : []),
    { name: product.name, url: `/product/${product.slug}` },
  ]

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(crumbs)) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            productJsonLd({
              name: product.name,
              description: product.shortDescription,
              slug: product.slug,
              sku: product.sku,
              brand: product.brand,
              image: images.map((i) => i.url),
              price,
              currency: product.currency,
              inStock,
            }),
          ),
        }}
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

      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <ProductGallery images={images} productName={product.name} />

        <div>
          {primaryCategory && <p className="text-sm font-medium text-ink-400">{primaryCategory.name}</p>}
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">{product.name}</h1>
          {product.shortDescription && <p className="mt-3 text-sm leading-relaxed text-ink-600">{product.shortDescription}</p>}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {product.poisonFree && <Badge tone="success">ללא רעל</Badge>}
            {product.readyToUse && <Badge tone="info">מוכן לשימוש</Badge>}
            {product.isBestSeller && <Badge tone="sand">רב מכר</Badge>}
            {product.isDemoData && <Badge tone="warning">נתוני דמו</Badge>}
          </div>

          <div className="mt-6 flex items-baseline gap-3">
            <span className="text-3xl font-black text-ink-900">{formatAgorot(price, product.currency)}</span>
            {discount !== null && (
              <>
                <span className="text-lg text-ink-400 line-through">{formatAgorot(product.price, product.currency)}</span>
                <Badge tone="danger">{discount}%- הנחה</Badge>
              </>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-400">המחיר כולל מע״מ</p>

          <p className={inStock ? 'mt-4 text-sm font-medium text-brand-700' : 'mt-4 text-sm font-medium text-ink-500'}>
            {inStock ? 'במלאי — נשלח תוך 3-5 ימי עסקים' : 'אזל מהמלאי'}
          </p>

          <div className="mt-6">
            <AddToCart productId={product.id} maxQuantity={product.stockPolicy === 'ALLOW_BACKORDER' ? null : available} disabled={!inStock} />
          </div>

          <ul className="mt-8 grid gap-3 text-sm text-ink-600 sm:grid-cols-3">
            <li className="flex items-center gap-2"><Truck className="size-4 text-brand-700" aria-hidden />משלוח עד הבית</li>
            <li className="flex items-center gap-2"><RotateCcw className="size-4 text-brand-700" aria-hidden />החזרה לפי מדיניות</li>
            <li className="flex items-center gap-2"><ShieldCheck className="size-4 text-brand-700" aria-hidden />מידע מאומת</li>
          </ul>
        </div>
      </div>

      {/* Content sections */}
      <div className="mt-14 grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="space-y-10">
          {product.description && (
            <section>
              <h2 className="text-lg font-bold text-ink-900">תיאור</h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-600">{product.description}</p>
            </section>
          )}

          {product.benefits.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-ink-900">יתרונות</h2>
              <ul className="mt-3 space-y-2">
                {product.benefits.map((benefit) => (
                  <li key={benefit} className="flex gap-2 text-sm text-ink-600">
                    <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-600" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {product.suitableFor.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-ink-900">מתאים עבור</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {product.suitableFor.map((item) => (
                  <li key={item} className="rounded-pill bg-ink-100 px-3 py-1.5 text-xs font-medium text-ink-700">{item}</li>
                ))}
              </ul>
            </section>
          )}

          {showRegulatorySection && reg && (
            <section className="rounded-card border border-amber-200 bg-amber-50/60 p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900">
                <AlertTriangle className="size-5 text-amber-600" aria-hidden />
                מידע והוראות שימוש
              </h2>
              <p className="mt-1 text-xs text-ink-500">
                המידע מוצג מתוך נתוני המוצר שאומתו מול התווית הרשמית
                {reg.labelVerifiedAt ? ` (עודכן ${new Intl.DateTimeFormat('he-IL').format(reg.labelVerifiedAt)})` : ''}.
              </p>
              <dl className="mt-4 space-y-4 text-sm">
                {reg.registrationNumber && (
                  <div>
                    <dt className="font-semibold text-ink-800">מספר רישום</dt>
                    <dd className="text-ink-600">{reg.registrationNumber}{reg.registrationAuthority ? ` — ${reg.registrationAuthority}` : ''}</dd>
                  </div>
                )}
                {reg.targetPests.length > 0 && (
                  <div>
                    <dt className="font-semibold text-ink-800">מיועד עבור</dt>
                    <dd className="text-ink-600">{reg.targetPests.join(', ')}</dd>
                  </div>
                )}
                {reg.allowedLocations.length > 0 && (
                  <div>
                    <dt className="font-semibold text-ink-800">מקומות שימוש מאושרים</dt>
                    <dd className="text-ink-600">{reg.allowedLocations.join(', ')}</dd>
                  </div>
                )}
                {reg.usageInstructions && (
                  <div>
                    <dt className="font-semibold text-ink-800">אופן השימוש</dt>
                    <dd className="whitespace-pre-line text-ink-600">{reg.usageInstructions}</dd>
                  </div>
                )}
                {reg.warnings && (
                  <div>
                    <dt className="font-semibold text-ink-800">אזהרות</dt>
                    <dd className="whitespace-pre-line text-ink-600">{reg.warnings}</dd>
                  </div>
                )}
                {reg.humanWarnings && (
                  <div>
                    <dt className="font-semibold text-ink-800">בטיחות בבני אדם</dt>
                    <dd className="whitespace-pre-line text-ink-600">{reg.humanWarnings}</dd>
                  </div>
                )}
                {reg.animalWarnings && (
                  <div>
                    <dt className="font-semibold text-ink-800">בטיחות בבעלי חיים</dt>
                    <dd className="whitespace-pre-line text-ink-600">{reg.animalWarnings}</dd>
                  </div>
                )}
                {reg.reentryTime && (
                  <div>
                    <dt className="font-semibold text-ink-800">זמן המתנה לפני חזרה לחדר</dt>
                    <dd className="text-ink-600">{reg.reentryTime}</dd>
                  </div>
                )}
                {reg.storageInstructions && (
                  <div>
                    <dt className="font-semibold text-ink-800">אחסון</dt>
                    <dd className="whitespace-pre-line text-ink-600">{reg.storageInstructions}</dd>
                  </div>
                )}
                {reg.disposalInstructions && (
                  <div>
                    <dt className="font-semibold text-ink-800">השלכה</dt>
                    <dd className="whitespace-pre-line text-ink-600">{reg.disposalInstructions}</dd>
                  </div>
                )}
              </dl>
              {reg.labelUrl && (
                <a href={reg.labelUrl} className="mt-4 inline-block text-sm font-semibold text-brand-700 underline" target="_blank" rel="noreferrer noopener">
                  לתווית המלאה
                </a>
              )}
            </section>
          )}

          {product.reviews.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-ink-900">ביקורות לקוחות</h2>
              <ul className="mt-4 space-y-4">
                {product.reviews.map((review) => (
                  <li key={review.id} className="rounded-card border border-ink-200 p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink-900">{review.authorName}</span>
                      {review.verifiedPurchase && <Badge tone="success">רכישה מאומתת</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-amber-600" aria-label={`דירוג ${review.rating} מתוך 5`}>
                      {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                    </p>
                    {review.title && <p className="mt-2 text-sm font-semibold text-ink-800">{review.title}</p>}
                    <p className="mt-1 text-sm text-ink-600">{review.body}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-card border border-ink-200 p-5">
            <h2 className="text-sm font-bold text-ink-900">משלוחים</h2>
            <p className="mt-2 text-sm text-ink-600">שליח עד הבית, נקודת איסוף או איסוף עצמי. פירוט מלא במדיניות המשלוחים.</p>
            <Link href="/page/shipping-policy" className="mt-2 inline-block text-sm font-semibold text-brand-700">למדיניות המשלוחים</Link>
          </section>
          <section className="rounded-card border border-ink-200 p-5">
            <h2 className="text-sm font-bold text-ink-900">החזרות</h2>
            <p className="mt-2 text-sm text-ink-600">ניתן להחזיר מוצרים בהתאם למדיניות ההחזרות ולחוק הגנת הצרכן.</p>
            <Link href="/page/returns-policy" className="mt-2 inline-block text-sm font-semibold text-brand-700">למדיניות ההחזרות</Link>
          </section>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xl font-bold tracking-tight text-ink-900">מוצרים נוספים באותה קטגוריה</h2>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
