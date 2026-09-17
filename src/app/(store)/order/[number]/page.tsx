import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Check } from "lucide-react";
import { brand } from "@/config/brand";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { formatArea, formatDate, formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { getRepository } from "@/server/repositories";

export const metadata: Metadata = {
  title: t.checkout.successTitle,
  robots: { index: false, follow: false },
};

export default async function OrderPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  const order = await getRepository().getOrderByNumber(number);
  if (!order) notFound();

  return (
    <div className="container-page max-w-3xl py-14 md:py-20">
      <div className="flex size-12 items-center justify-center rounded-full bg-success text-white">
        <Check className="size-6" />
      </div>
      <h1 className="mt-6 text-display-sm">{t.checkout.successTitle}</h1>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
        {t.checkout.successBody}
      </p>

      <dl className="mt-8 grid gap-4 rounded-lg border border-line bg-surface p-5 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">{t.checkout.orderNumber}</dt>
          <dd className="num mt-1 font-display text-lg text-ink">{order.number}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">תאריך</dt>
          <dd className="num mt-1 text-ink">{formatDate(order.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t.cart.total}</dt>
          <dd className="num mt-1 font-display text-lg text-ink">
            {formatPrice(order.total)}
          </dd>
        </div>
      </dl>

      <ul className="mt-8 divide-y divide-line border-y border-line">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-center gap-4 py-4">
            <span className="relative size-16 shrink-0 overflow-hidden rounded-sm bg-surface-2">
              {item.imageUrl ? (
                <Image src={item.imageUrl} alt="" fill sizes="64px" className="object-cover" />
              ) : null}
            </span>
            <span className="min-w-0 flex-1">
              <Link
                href={routes.product(item.productSlug)}
                className="link-quiet block truncate text-sm text-ink"
              >
                {item.name}
              </Link>
              <span className="num mt-0.5 block text-xs text-muted">
                {item.units} × {formatPrice(item.unitPrice)}
                {item.coveredSqm ? ` · ${formatArea(item.coveredSqm)}` : ""}
              </span>
            </span>
            <span className="num shrink-0 text-sm text-ink">
              {formatPrice(item.lineTotal)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="eyebrow mb-2">{t.checkout.delivery}</h2>
          <p className="text-sm text-ink-soft">
            {order.fulfilment === "PICKUP"
              ? `${t.checkout.pickupOption} · ${brand.contact.address}`
              : `${order.street}, ${order.city}${order.floor ? ` · ${order.floor}` : ""}`}
          </p>
          {order.installation ? (
            <p className="mt-2 text-sm text-brass">כולל שירות התקנה</p>
          ) : null}
        </div>
        <div>
          <h2 className="eyebrow mb-2">{t.checkout.contact}</h2>
          <p className="text-sm text-ink-soft">{order.customerName}</p>
          <p className="num text-sm text-ink-soft">{order.phone}</p>
          <p className="text-sm text-ink-soft">{order.email}</p>
        </div>
      </div>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Button asChild>
          <Link href={routes.catalog}>{t.checkout.backToStore}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={routes.account.orders}>{t.account.orders}</Link>
        </Button>
      </div>
    </div>
  );
}
