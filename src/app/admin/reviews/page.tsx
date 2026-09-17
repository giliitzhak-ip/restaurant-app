import type { Metadata } from "next";
import { t } from "@/i18n";
import { formatDate } from "@/lib/format";
import { Rating } from "@/components/ui/rating";
import { getRepository } from "@/server/repositories";
import { AdminCell, AdminPageHeader, AdminTable } from "@/features/admin/admin-table";
import { ReviewApproval } from "@/features/admin/review-actions";

export const metadata: Metadata = {
  title: t.admin.reviews,
  robots: { index: false, follow: false },
};

export default async function AdminReviewsPage() {
  const repository = getRepository();
  const reviews = await repository.listReviews(undefined, {
    includeUnapproved: true,
  });
  const products = await repository.getProductsByIds(
    reviews.map((review) => review.productId).filter((id): id is string => Boolean(id)),
  );
  const names = new Map(products.map((product) => [product.id, product.name]));

  return (
    <div>
      <AdminPageHeader
        title={t.admin.reviews}
        description="חוות דעת מאושרות מוצגות בעמוד המוצר ובעמוד הבית"
      />
      <AdminTable head={["דירוג", "כותרת", "מוצר", "לקוח", "תאריך", ""]}>
        {reviews.map((review) => (
          <tr key={review.id}>
            <AdminCell>
              <Rating value={review.rating} />
            </AdminCell>
            <AdminCell>
              {review.title}
              <p className="mt-0.5 max-w-md text-xs text-muted">{review.body}</p>
            </AdminCell>
            <AdminCell className="text-muted">
              {review.productId ? (names.get(review.productId) ?? "—") : "כללי"}
            </AdminCell>
            <AdminCell className="text-muted">
              {review.authorName}
              <p className="text-xs">{review.city}</p>
            </AdminCell>
            <AdminCell className="num text-muted">
              {formatDate(review.createdAt)}
            </AdminCell>
            <AdminCell>
              <ReviewApproval id={review.id} approved={review.approved} />
            </AdminCell>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
