import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Check, Clock, CreditCard, TriangleAlert } from "lucide-react";
import { brand } from "@/config/brand";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { formatArea, formatDate, formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Steps, type Step } from "@/components/ui/steps";
import { getSessionUser } from "@/server/auth/session";
import { clearCartIfMatches } from "@/server/cart/cart-service";
import { clearsCart } from "@/server/commerce/order-flow";
import { getRepository } from "@/server/repositories";
import type { Order } from "@/types/commerce";

export const metadata: Metadata = {
  title: t.checkout.successTitle,
  robots: { index: false, follow: false },
};

/**
 * Order confirmation.
 *
 * The order number is sequential and printed on paperwork, so it is not a
 * secret and must not be an access token. Two things authorise this page:
 *
 *  - the `token` query parameter, which is 256 bits of CSPRNG output stored on
 *    the order and handed back only to the person who placed it, or
 *  - a session whose user id owns the order.
 *
 * Anything else gets a 404 — not a 403, which would confirm the order exists.
 */
async function authorise(number: string, token: string | undefined): Promise<Order | null> {
  const repository = getRepository();

  if (token) {
    const byToken = await repository.getOrderByToken(number, token);
    if (byToken) return byToken;
  }

  const user = await getSessionUser();
  if (!user) return null;
  const order = await repository.getOrderByNumber(number);
  if (!order) return null;
  if (order.userId && order.userId === user.id) return order;
  if (user.role === "ADMIN") return order;
  return null;
}

const STATUS_VIEW = {
  PAYMENT_PENDING: {
    icon: Clock,
    tone: "bg-warning text-white",
    title: "ההזמנה ממתינה לאישור תשלום",
    body: "פתחנו את ההזמנה ושמרנו את המלאי. ברגע שספק הסליקה יאשר את החיוב נעדכן את הסטטוס ונשלח אישור במייל.",
  },
  PENDING: {
    icon: CreditCard,
    tone: "bg-brass text-white",
    title: t.checkout.successTitle,
    body: "ההזמנה נרשמה. נציג יחזור אליכם לתיאום התשלום ואישור מועד האספקה.",
  },
  PAID: { icon: Check, tone: "bg-success text-white", title: t.checkout.successTitle, body: t.checkout.successBody },
  PROCESSING: { icon: Check, tone: "bg-success text-white", title: "ההזמנה בהכנה", body: t.checkout.successBody },
  SHIPPED: { icon: Check, tone: "bg-success text-white", title: "ההזמנה נשלחה", body: t.checkout.successBody },
  COMPLETED: { icon: Check, tone: "bg-success text-white", title: "ההזמנה הושלמה", body: t.checkout.successBody },
  PAYMENT_FAILED: {
    icon: TriangleAlert,
    tone: "bg-danger text-white",
    title: "התשלום לא הושלם",
    body: "לא בוצע חיוב. אפשר לנסות שוב מהסל, או לדבר איתנו ונשלים את ההזמנה יחד.",
  },
  CANCELLED: {
    icon: TriangleAlert,
    tone: "bg-danger text-white",
    title: "ההזמנה בוטלה",
    body: "לא בוצע חיוב והמלאי שוחרר. הסל שלכם נשאר כפי שהיה.",
  },
} as const;

/**
 * The four stages an order passes through, resolved from the status the
 * database holds and nothing else. No estimated dates, no "arriving soon",
 * and no step marked in progress because time has passed — if the gateway has
 * not called back, the timeline says the payment is the current step and
 * leaves it there.
 */
function orderSteps(order: Order): Step[] {
  const reached = (statuses: readonly Order["status"][]) =>
    statuses.includes(order.status);

  const cancelled = order.status === "CANCELLED";
  const paymentFailed = order.status === "PAYMENT_FAILED";
  const paid = reached(["PAID", "PROCESSING", "SHIPPED", "COMPLETED"]);
  const processing = reached(["PROCESSING", "SHIPPED", "COMPLETED"]);

  const after = (done: boolean, current: boolean): Step["state"] =>
    done ? "done" : current ? "current" : "upcoming";

  return [
    {
      id: "placed",
      label: "ההזמנה נקלטה",
      detail: formatDate(order.createdAt),
      state: cancelled ? "failed" : "done",
    },
    {
      id: "payment",
      label: cancelled ? "ההזמנה בוטלה" : paymentFailed ? "התשלום נכשל" : "תשלום",
      detail: order.paidAt ? formatDate(order.paidAt) : undefined,
      state:
        cancelled || paymentFailed
          ? "failed"
          : after(paid, !paid),
    },
    {
      id: "processing",
      label: "בהכנה",
      state: cancelled ? "upcoming" : after(processing, paid && !processing),
    },
    {
      id: "shipped",
      label: order.fulfilment === "PICKUP" ? "מוכנה לאיסוף" : "נשלחה",
      state: cancelled
        ? "upcoming"
        : after(order.status === "COMPLETED", order.status === "SHIPPED"),
    },
  ];
}

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ number: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { number } = await params;
  const { token } = await searchParams;
  const order = await authorise(number, token);
  if (!order) notFound();

  /*
   * The basket is emptied here and not at checkout: a customer who abandons
   * the payment page has to come back to a full cart, not an empty one.
   */
  if (clearsCart(order.status)) await clearCartIfMatches(order.idempotencyKey ?? null);

  const view = STATUS_VIEW[order.status];
  const Icon = view.icon;

  return (
    <div className="container-page max-w-3xl py-14 md:py-20">
      <div className={`flex size-12 items-center justify-center rounded-full ${view.tone}`}>
        <Icon className="size-6" />
      </div>
      <h1 className="mt-6 text-display-sm">{view.title}</h1>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">{view.body}</p>

      <Steps steps={orderSteps(order)} className="mt-9" />

      <dl className="mt-8 grid gap-4 card p-5 sm:grid-cols-3">
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
          <dd className="num mt-1 font-display text-lg text-ink">{formatPrice(order.total)}</dd>
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
            <span className="num shrink-0 text-sm text-ink">{formatPrice(item.lineTotal)}</span>
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

      <p className="mt-6 text-xs text-muted">
        הקישור לעמוד הזה הוא אישי. אל תשתפו אותו — הוא מציג את פרטי ההזמנה.
      </p>

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
