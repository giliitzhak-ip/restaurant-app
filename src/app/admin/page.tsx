import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { formatDate, formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { getRepository } from "@/server/repositories";
import { AdminCell, AdminPageHeader, AdminTable } from "@/features/admin/admin-table";

export const metadata: Metadata = {
  title: t.admin.dashboard,
  robots: { index: false, follow: false },
};

export default async function AdminDashboard() {
  const repository = getRepository();
  const [stats, orders, quotes, lowStock] = await Promise.all([
    repository.getAdminStats(),
    repository.listOrders(),
    repository.listQuotes(),
    repository.listProducts({
      availability: ["LOW_STOCK", "OUT_OF_STOCK"],
      includeInactive: true,
      limit: 8,
    }),
  ]);

  const cards = [
    { label: t.admin.statsRevenue, value: formatPrice(stats.revenue) },
    { label: t.admin.statsOrders, value: String(stats.orders) },
    { label: t.admin.statsQuotes, value: String(stats.openQuotes) },
    { label: t.admin.statsDesigns, value: String(stats.designs) },
    { label: t.admin.statsLowStock, value: String(stats.lowStock) },
    { label: t.admin.customers, value: String(stats.customers) },
  ];

  return (
    <div>
      <AdminPageHeader title={t.admin.dashboard} />

      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {cards.map((card) => (
          <li key={card.label} className="rounded-lg border border-line bg-surface p-5">
            <p className="text-xs text-muted">{card.label}</p>
            <p className="num mt-1.5 font-display text-2xl text-ink">{card.value}</p>
          </li>
        ))}
      </ul>

      <section className="mt-10">
        <h2 className="mb-4 text-lg">{t.admin.orders}</h2>
        {orders.length === 0 ? (
          <p className="text-sm text-muted">אין הזמנות עדיין.</p>
        ) : (
          <AdminTable head={["מספר", "לקוח", "תאריך", "סה״כ", "סטטוס"]}>
            {orders.slice(0, 6).map((order) => (
              <tr key={order.id}>
                <AdminCell>
                  <Link href={routes.order(order.number)} className="num link-quiet">
                    {order.number}
                  </Link>
                </AdminCell>
                <AdminCell>{order.customerName}</AdminCell>
                <AdminCell className="num text-muted">
                  {formatDate(order.createdAt)}
                </AdminCell>
                <AdminCell className="num">{formatPrice(order.total)}</AdminCell>
                <AdminCell>
                  <Badge variant="neutral">{order.status}</Badge>
                </AdminCell>
              </tr>
            ))}
          </AdminTable>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-lg">{t.admin.quotes}</h2>
        {quotes.length === 0 ? (
          <p className="text-sm text-muted">אין בקשות פתוחות.</p>
        ) : (
          <AdminTable head={["מספר", "לקוח", "עיר", "מ״ר", "סטטוס"]}>
            {quotes.slice(0, 6).map((quote) => (
              <tr key={quote.id}>
                <AdminCell className="num">{quote.number}</AdminCell>
                <AdminCell>{quote.customerName}</AdminCell>
                <AdminCell className="text-muted">{quote.city}</AdminCell>
                <AdminCell className="num">{quote.areaSqm ?? "—"}</AdminCell>
                <AdminCell>
                  <Badge variant="neutral">{quote.status}</Badge>
                </AdminCell>
              </tr>
            ))}
          </AdminTable>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-lg">{t.admin.statsLowStock}</h2>
        {lowStock.items.length === 0 ? (
          <p className="text-sm text-muted">כל המוצרים במלאי תקין.</p>
        ) : (
          <AdminTable head={["מוצר", "מק״ט", "מלאי", "זמינות"]}>
            {lowStock.items.map((product) => (
              <tr key={product.id}>
                <AdminCell>
                  <Link href={routes.admin.product(product.id)} className="link-quiet">
                    {product.name}
                  </Link>
                </AdminCell>
                <AdminCell className="num text-muted">{product.sku}</AdminCell>
                <AdminCell className="num">{product.stockUnits}</AdminCell>
                <AdminCell>
                  <Badge
                    variant={
                      product.availability === "OUT_OF_STOCK" ? "danger" : "warning"
                    }
                  >
                    {product.availability}
                  </Badge>
                </AdminCell>
              </tr>
            ))}
          </AdminTable>
        )}
      </section>
    </div>
  );
}
