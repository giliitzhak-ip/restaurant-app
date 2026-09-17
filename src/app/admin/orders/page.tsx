import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { formatArea, formatDateTime, formatPrice } from "@/lib/format";
import { getRepository } from "@/server/repositories";
import { AdminCell, AdminPageHeader, AdminTable } from "@/features/admin/admin-table";
import { OrderStatusSelect } from "@/features/admin/status-select";
export const metadata: Metadata = {
  title: t.admin.orders,
  robots: { index: false, follow: false },
};

export default async function AdminOrdersPage() {
  const orders = await getRepository().listOrders();

  return (
    <div>
      <AdminPageHeader title={t.admin.orders} description={`${orders.length} הזמנות`} />
      {orders.length === 0 ? (
        <p className="text-sm text-muted">אין הזמנות עדיין.</p>
      ) : (
        <AdminTable
          head={["מספר", "לקוח", "פרטים", "מ״ר", "סה״כ", "סטטוס"]}
        >
          {orders.map((order) => (
            <tr key={order.id}>
              <AdminCell>
                <Link href={routes.order(order.number)} className="num link-quiet">
                  {order.number}
                </Link>
                <p className="num text-xs text-muted">
                  {formatDateTime(order.createdAt)}
                </p>
              </AdminCell>
              <AdminCell>
                {order.customerName}
                <p className="num text-xs text-muted">{order.phone}</p>
                <p className="text-xs text-muted">{order.email}</p>
              </AdminCell>
              <AdminCell className="text-xs text-muted">
                {order.fulfilment === "PICKUP"
                  ? "איסוף עצמי"
                  : `${order.street ?? ""}, ${order.city ?? ""}`}
                <p>{order.items.length} מוצרים</p>
                {order.installation ? <p className="text-brass">כולל התקנה</p> : null}
                {order.notes ? <p className="mt-1">״{order.notes}״</p> : null}
              </AdminCell>
              <AdminCell className="num">
                {formatArea(
                  order.items.reduce((sum, item) => sum + (item.coveredSqm ?? 0), 0),
                )}
              </AdminCell>
              <AdminCell className="num">{formatPrice(order.total)}</AdminCell>
              <AdminCell>
                <OrderStatusSelect
                  id={order.id}
                  status={order.status}
                  number={order.number}
                />
              </AdminCell>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
