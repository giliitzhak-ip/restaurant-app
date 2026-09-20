import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { formatDate, formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/server/auth/session";
import { getRepository } from "@/server/repositories";

export const metadata: Metadata = {
  title: t.account.title,
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const user = await getSessionUser();
  /*
   * Guarded here as well as in the layout. A layout redirect is resolved after
   * the shell has streamed, so on its own it can leave the page rendering for
   * an unauthenticated visitor; the page-level check is what actually keeps
   * the data out of the response.
   */
  if (!user) redirect(`${routes.login}?next=${encodeURIComponent(routes.account.root)}`);
  const repository = getRepository();
  const [orders, designs, favorites, quotes] = await Promise.all([
    repository.listOrders(user.id),
    repository.listDesigns({ userId: user.id }),
    repository.listFavorites(user.id),
    repository.listQuotes(user.id),
  ]);

  const cards = [
    { label: t.account.orders, value: orders.length, href: routes.account.orders },
    { label: t.account.designs, value: designs.length, href: routes.account.designs },
    { label: t.account.quotes, value: quotes.length, href: routes.account.quotes },
    {
      label: t.account.favorites,
      value: favorites.length,
      href: routes.account.favorites,
    },
  ];

  return (
    <div className="space-y-10">
      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <li key={card.href}>
            <Link
              href={card.href}
              className="block card p-5 transition-colors hover:border-ink"
            >
              <span className="num block font-display text-3xl text-ink">
                {card.value}
              </span>
              <span className="mt-1 block text-xs text-muted">{card.label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <section>
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-xl">{t.account.orders}</h2>
          <Link
            href={routes.account.orders}
            className="link-quiet inline-flex items-center gap-1.5 text-sm text-ink"
          >
            {t.common.viewAll}
            <ArrowLeft className="size-4" />
          </Link>
        </div>
        {orders.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t.account.ordersEmpty}</p>
        ) : (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {orders.slice(0, 3).map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-4 py-4">
                <div>
                  <Link
                    href={routes.order(order.number)}
                    className="link-quiet num text-sm text-ink"
                  >
                    {order.number}
                  </Link>
                  <p className="num mt-0.5 text-xs text-muted">
                    {formatDate(order.createdAt)} · {order.items.length} מוצרים
                  </p>
                </div>
                <span className="num text-sm text-ink">{formatPrice(order.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-6">
        <h2 className="text-lg">{t.designer.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {t.designer.introBody}
        </p>
        <Button asChild className="mt-4">
          <Link href={routes.designer}>{t.account.designsEmptyCta}</Link>
        </Button>
      </section>
    </div>
  );
}
