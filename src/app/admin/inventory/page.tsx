import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { getRepository } from "@/server/repositories";
import { AdminCell, AdminPageHeader, AdminTable } from "@/features/admin/admin-table";
import { StockInput } from "@/features/admin/stock-input";
import { availabilityLabels } from "@/features/catalog/labels";

export const metadata: Metadata = {
  title: t.admin.inventory,
  robots: { index: false, follow: false },
};

export default async function AdminInventoryPage() {
  const { items } = await getRepository().listProducts({
    includeInactive: true,
    limit: 300,
    sort: "popular",
  });

  return (
    <div>
      <AdminPageHeader
        title={t.admin.inventory}
        description="עדכון מלאי מעדכן מיד את הזמינות באתר"
      />
      <AdminTable head={["מוצר", "מק״ט", "מלאי", "זמינות", "אספקה"]}>
        {items.map((product) => (
          <tr key={product.id}>
            <AdminCell>
              <Link href={routes.admin.product(product.id)} className="link-quiet">
                {product.name}
              </Link>
            </AdminCell>
            <AdminCell className="num text-muted">{product.sku}</AdminCell>
            <AdminCell>
              <StockInput id={product.id} value={product.stockUnits} />
            </AdminCell>
            <AdminCell>
              <Badge
                variant={
                  product.availability === "IN_STOCK"
                    ? "success"
                    : product.availability === "OUT_OF_STOCK"
                      ? "danger"
                      : "warning"
                }
              >
                {availabilityLabels[product.availability]}
              </Badge>
            </AdminCell>
            <AdminCell className="num text-muted">{product.leadTimeDays} ימים</AdminCell>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
