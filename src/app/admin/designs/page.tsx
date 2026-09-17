import type { Metadata } from "next";
import Image from "next/image";
import { t } from "@/i18n";
import { formatArea, formatDateTime, formatPrice } from "@/lib/format";
import { getRepository } from "@/server/repositories";
import { AdminCell, AdminPageHeader, AdminTable } from "@/features/admin/admin-table";

export const metadata: Metadata = {
  title: t.admin.designs,
  robots: { index: false, follow: false },
};

export default async function AdminDesignsPage() {
  const designs = await getRepository().listDesignsForAdmin();

  return (
    <div>
      <AdminPageHeader
        title={t.admin.designs}
        description="עיצובים שלקוחות שמרו — אינדיקציה מעולה לכוונת קנייה"
      />
      {designs.length === 0 ? (
        <p className="text-sm text-muted">עוד לא נשמרו עיצובים.</p>
      ) : (
        <AdminTable head={["הדמיה", "שם", "מוצרים", "שטח", "מחיר משוער", "עודכן"]}>
          {designs.map((design) => (
            <tr key={design.id}>
              <AdminCell>
                <span className="relative block h-14 w-20 overflow-hidden rounded-xs bg-surface-2">
                  {design.renderedImageUrl || design.originalImageUrl ? (
                    <Image
                      src={design.renderedImageUrl || design.originalImageUrl}
                      alt=""
                      fill
                      sizes="80px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : null}
                </span>
              </AdminCell>
              <AdminCell>
                {design.name}
                <p className="text-xs text-muted">
                  {design.userId ? "לקוח רשום" : "אורח"}
                </p>
              </AdminCell>
              <AdminCell className="text-xs text-muted">
                {design.floorProductName ? (
                  <p>{t.designer.selectedFloor}: {design.floorProductName}</p>
                ) : null}
                {design.wallProductName ? (
                  <p>{t.designer.selectedWall}: {design.wallProductName}</p>
                ) : null}
              </AdminCell>
              <AdminCell className="num">{formatArea(design.estimatedAreaSqm)}</AdminCell>
              <AdminCell className="num">{formatPrice(design.estimatedPrice)}</AdminCell>
              <AdminCell className="num text-muted">
                {formatDateTime(design.updatedAt)}
              </AdminCell>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
