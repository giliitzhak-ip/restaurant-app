import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/auth/guard'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { ReviewModeration } from '@/components/admin/review-moderation'

export default async function AdminReviewsPage() {
  await requireAdminPage('reviews.moderate')

  const reviews = await prisma.review.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 100,
    include: { product: { select: { name: true } } },
  })

  return (
    <>
      <PageHeader title="ביקורות" description="ביקורת מתפרסמת רק לאחר אישור." />
      {reviews.length === 0 ? (
        <EmptyState title="אין ביקורות" description="ביקורות שיתקבלו יופיעו כאן לאישור." />
      ) : (
        <ul className="space-y-3">
          {reviews.map((review) => (
            <ReviewModeration
              key={review.id}
              review={{
                id: review.id,
                productName: review.product.name,
                authorName: review.authorName,
                rating: review.rating,
                title: review.title,
                body: review.body,
                status: review.status,
                verifiedPurchase: review.verifiedPurchase,
              }}
            />
          ))}
        </ul>
      )}
    </>
  )
}
