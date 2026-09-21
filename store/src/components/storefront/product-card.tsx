import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { ProductImage } from '@/components/storefront/product-image'
import { formatAgorot } from '@/lib/money'
import type { ProductCardView } from '@/lib/catalog/queries'

/**
 * `showPendingPrice` is only ever true inside the admin preview. The public
 * store does not display products without a price at all.
 */
export function ProductCard({
  product,
  showPendingPrice = false,
  priority = false,
}: {
  product: ProductCardView
  showPendingPrice?: boolean
  priority?: boolean
}) {
  const hasPrice = product.finalPrice !== null

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-card border border-ink-200 bg-white transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lift">
      <div className="relative aspect-square overflow-hidden bg-white">
        <ProductImage
          src={product.imageUrl}
          alt={product.imageAlt}
          priority={priority}
          className="transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
        />
        <div className="absolute top-3 flex flex-col gap-1.5 start-3">
          {product.discount !== null && <Badge tone="danger">{product.discount}%- הנחה</Badge>}
          {product.isNew && <Badge tone="brand">חדש</Badge>}
          {product.isBestSeller && <Badge tone="sand">רב מכר</Badge>}
          {product.poisonFree && <Badge tone="success">ללא רעל</Badge>}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        {product.categoryName && (
          <p className="text-xs font-medium text-ink-400">{product.categoryName}</p>
        )}
        <h3 className="text-sm font-semibold leading-snug text-ink-900">
          <Link href={`/product/${product.slug}`} className="after:absolute after:inset-0 after:content-['']">
            {product.name}
          </Link>
        </h3>

        <div className="mt-auto pt-3">
          {hasPrice ? (
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-ink-900">
                {formatAgorot(product.finalPrice, product.currency)}
              </span>
              {product.discount !== null && (
                <span className="text-sm text-ink-400 line-through">
                  {formatAgorot(product.price, product.currency)}
                </span>
              )}
            </div>
          ) : showPendingPrice ? (
            <span className="text-sm font-medium text-amber-700">מחיר יעודכן בקרוב</span>
          ) : null}
          {!product.inStock && hasPrice && (
            <p className="mt-1 text-xs font-medium text-ink-500">אזל מהמלאי</p>
          )}
        </div>
      </div>
    </article>
  )
}
