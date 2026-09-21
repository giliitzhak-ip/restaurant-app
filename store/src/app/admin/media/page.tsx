import Link from 'next/link'
import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/auth/guard'
import { pickRendition } from '@/lib/media/renditions'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { MediaLibraryItem } from '@/components/admin/media-library-item'
import { Button } from '@/components/ui/button'

export default async function AdminMediaPage() {
  await requireAdminPage('media.view')

  const media = await prisma.media.findMany({
    orderBy: { createdAt: 'desc' },
    take: 120,
    include: {
      _count: { select: { productLinks: true } },
      productLinks: { take: 1, select: { product: { select: { id: true, name: true } } } },
    },
  })

  return (
    <>
      <PageHeader
        title="ספריית מדיה"
        description="כל התמונות שהועלו למערכת. תמונה המשויכת למוצר אינה ניתנת למחיקה."
        action={<Link href="/admin/media/import"><Button variant="outline">ייבוא מרוכז</Button></Link>}
      />

      {media.length === 0 ? (
        <EmptyState title="הספרייה ריקה" description="ניתן להעלות תמונות מתוך דף המוצר או דרך הייבוא המרוכז." />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {media.map((item) => (
            <MediaLibraryItem
              key={item.id}
              media={{
                id: item.id,
                thumbnailUrl: pickRendition(item.variants, 'card', item.url),
                originalName: item.originalName,
                width: item.width,
                height: item.height,
                fileSize: item.fileSize,
                usageCount: item._count.productLinks,
                firstProduct: item.productLinks[0]
                  ? { id: item.productLinks[0].product.id, name: item.productLinks[0].product.name }
                  : null,
              }}
            />
          ))}
        </ul>
      )}
    </>
  )
}
