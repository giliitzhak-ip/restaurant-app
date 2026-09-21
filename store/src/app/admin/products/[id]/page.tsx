import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/auth/guard'
import { publishDecisionFor } from '@/lib/catalog/product-service'
import { pickRendition } from '@/lib/media/renditions'
import { PageHeader } from '@/components/admin/page-header'
import { MediaManager, type ManagedImage } from '@/components/admin/media-manager'
import { ProductForm } from '@/components/admin/product-form'
import { ProductStatusBadge, RegulatoryStatusBadge, DemoBadge } from '@/components/admin/status-badge'
import { PublishPanel } from '@/components/admin/publish-panel'

export default async function AdminProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage('products.view')
  const { id } = await params

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      media: { orderBy: [{ isMain: 'desc' }, { position: 'asc' }], include: { media: true } },
      categories: true,
      inventory: true,
      regulatory: true,
      supplierLinks: { include: { supplier: { select: { code: true, name: true } } } },
    },
  })
  if (!product) notFound()

  const [categories, decision] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ parentId: 'asc' }, { position: 'asc' }],
      select: { id: true, name: true, parent: { select: { name: true } } },
    }),
    publishDecisionFor(id),
  ])

  const images: ManagedImage[] = product.media.map((link) => ({
    productMediaId: link.id,
    mediaId: link.mediaId,
    thumbnailUrl: pickRendition(link.media.variants, 'card', link.media.url),
    alt: link.alt ?? link.media.alt ?? '',
    isMain: link.isMain,
    fileName: link.media.originalName,
    width: link.media.width,
    height: link.media.height,
    fileSize: link.media.fileSize,
  }))

  return (
    <>
      <PageHeader
        title={product.name}
        description={product.sku ? `מק״ט ${product.sku}` : 'מק״ט ממתין לעדכון'}
        action={
          <div className="flex items-center gap-2">
            <ProductStatusBadge status={product.status} />
            {product.regulatory && <RegulatoryStatusBadge status={product.regulatory.status} />}
            {product.isDemoData && <DemoBadge />}
            {product.published && (
              <Link href={`/product/${product.slug}`} className="flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline" target="_blank">
                בחנות <ExternalLink className="size-3" aria-hidden />
              </Link>
            )}
          </div>
        }
      />

      <Link href="/admin/products" className="mb-5 inline-block text-sm font-medium text-brand-700 hover:underline">
        ← חזרה לרשימת המוצרים
      </Link>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <div className="rounded-card border border-ink-200 bg-white p-5">
            <MediaManager productId={product.id} images={images} />
          </div>

          <div className="rounded-card border border-ink-200 bg-white p-5">
            <ProductForm
              productId={product.id}
              categories={categories.map((c) => ({
                id: c.id,
                label: c.parent ? `${c.parent.name} › ${c.name}` : c.name,
              }))}
              initial={{
                name: product.name,
                nameEn: product.nameEn ?? '',
                slug: product.slug,
                sku: product.sku ?? '',
                barcode: product.barcode ?? '',
                brand: product.brand ?? '',
                shortDescription: product.shortDescription ?? '',
                description: product.description ?? '',
                benefits: product.benefits.join('\n'),
                suitableFor: product.suitableFor.join('\n'),
                keywords: product.keywords.join('\n'),
                kind: product.kind,
                environment: product.environment,
                stockPolicy: product.stockPolicy,
                poisonFree: product.poisonFree,
                readyToUse: product.readyToUse,
                isBestSeller: product.isBestSeller,
                isNew: product.isNew,
                costPrice: product.costPrice,
                price: product.price,
                salePrice: product.salePrice,
                stock: product.inventory?.onHand ?? 0,
                reorderPoint: product.inventory?.reorderPoint ?? 0,
                metaTitle: product.metaTitle ?? '',
                metaDescription: product.metaDescription ?? '',
                categoryIds: product.categories.map((c) => c.categoryId),
                primaryCategoryId: product.categories.find((c) => c.isPrimary)?.categoryId ?? '',
                supplierSku: product.supplierLinks[0]?.supplierSku ?? '',
              }}
            />
          </div>
        </div>

        <aside className="space-y-4">
          <PublishPanel productId={product.id} status={product.status} allowed={decision.allowed} blockers={decision.blockers} />

          <section className="rounded-card border border-ink-200 bg-white p-5">
            <h2 className="text-sm font-bold text-ink-900">ספק</h2>
            {product.supplierLinks.length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">לא שויך ספק.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-sm text-ink-700">
                {product.supplierLinks.map((link) => (
                  <li key={link.id}>
                    {link.supplier.name}
                    <span className="text-ink-400"> · מק״ט ספק: {link.supplierSku ?? 'ממתין לעדכון'}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-ink-400">פרטי הספק הם מידע פנימי ואינם מוצגים ללקוח.</p>
          </section>

          <section className="rounded-card border border-ink-200 bg-white p-5">
            <h2 className="text-sm font-bold text-ink-900">רגולציה</h2>
            {product.regulatory ? (
              <>
                <div className="mt-2"><RegulatoryStatusBadge status={product.regulatory.status} /></div>
                <dl className="mt-3 space-y-1.5 text-xs text-ink-600">
                  <div className="flex justify-between gap-2"><dt>מספר רישום</dt><dd>{product.regulatory.registrationNumber ?? 'ממתין לעדכון'}</dd></div>
                  <div className="flex justify-between gap-2"><dt>אימות תווית</dt><dd>{product.regulatory.labelVerifiedAt ? new Intl.DateTimeFormat('he-IL').format(product.regulatory.labelVerifiedAt) : 'ממתין לעדכון'}</dd></div>
                </dl>
                <Link href={`/admin/regulatory/${product.id}`} className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">
                  לעריכת הרשומה הרגולטורית ←
                </Link>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-500">אין רשומה רגולטורית (מוצר שאינו תכשיר).</p>
            )}
          </section>
        </aside>
      </div>
    </>
  )
}
