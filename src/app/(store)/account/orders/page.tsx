import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Package } from "lucide-react";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { formatDate, formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionUser } from "@/server/auth/session";
import { getRepository } from "@/server/repositories";
import type { OrderStatus } from "@/types/commerce";

export const metadata: Metadata = {
  title: t.account.orders,
  robots: { index: false, follow: false },
};

const statusLabels: Record<OrderStatus, string> = {
  PAYMENT_PENDING: "ממתינה לאישור תשלום",
  PENDING: "ממתינה לתשלום",
  PAID: "שולמה",
  PAYMENT_FAILED: "התשלום נכשל",
  PROCESSING: "בהכנה",
  SHIPPED: "נשלחה",
  COMPLETED: "הושלמה",
  CANCELLED: "בוטלה",
};

export default async function AccountOrdersPage() {
  const user = await getSessionUser();
  /*
   * Guarded here as well as in the layout. A layout redirect is resolved after
   * the shell has streamed, so on its own it can leave the page rendering for
   * an unauthenticated visitor; the page-level check is what actually keeps
   * the data out of the response.
   */
  if (!user) redirect(`${routes.login}?next=${encodeURIComponent(routes.account.root)}`);
  const orders = await getRepository().listOrders(user.id);

  if (!orders.length) {
    return (
      <EmptyState
        icon={<Package />}
        title={t.account.ordersEmpty}
        action={
          <Button asChild>
            <Link href={routes.catalog}>{t.cart.emptyCta}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div>
      <h2 className="text-xl">{t.account.orders}</h2>
      <ul className="mt-6 space-y-5">
        {orders.map((order) => (
          <li key={order.id} className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Link
                  href={routes.order(order.number)}
                  className="link-quiet num text-[0.9375rem] font-medium text-ink"
                >
                  {order.number}
                </Link>
                <p className="num mt-0.5 text-xs text-muted">
                  {formatDate(order.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge
                  variant={
                    order.status === "CANCELLED"
                      ? "danger"
                      : order.status === "COMPLETED"
                        ? "success"
                        : "neutral"
                  }
                >
                  {statusLabels[order.status]}
                </Badge>
                <span className="num font-display text-lg text-ink">
                  {formatPrice(order.total)}
                </span>
              </div>
            </div>
            <ul className="mt-4 flex flex-wrap gap-2">
              {order.items.map((item) => (
                <li key={item.id} className="relative size-14 overflow-hidden rounded-xs bg-surface-2">
                  {item.imageUrl ? (
                    <Image src={item.imageUrl} alt={item.name} fill sizes="56px" className="object-cover" />
                  ) : null}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
