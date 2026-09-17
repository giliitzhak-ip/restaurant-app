import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpLeft } from "lucide-react";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { getSessionUser } from "@/server/auth/session";
import { getRepository } from "@/server/repositories";
import { BrandMark } from "@/components/layout/brand-mark";
import { LogoutButton } from "@/features/account/logout-button";

const nav = [
  { href: routes.admin.root, label: t.admin.dashboard },
  { href: routes.admin.products, label: t.admin.products },
  { href: routes.admin.inventory, label: t.admin.inventory },
  { href: routes.admin.orders, label: t.admin.orders },
  { href: routes.admin.quotes, label: t.admin.quotes },
  { href: routes.admin.designs, label: t.admin.designs },
  { href: routes.admin.categories, label: t.admin.categories },
  { href: routes.admin.collections, label: t.admin.collections },
  { href: routes.admin.coupons, label: t.admin.coupons },
  { href: routes.admin.reviews, label: t.admin.reviews },
  { href: routes.admin.customers, label: t.admin.customers },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect(`${routes.login}?next=${encodeURIComponent(routes.admin.root)}`);
  }
  if (user.role !== "ADMIN") {
    return (
      <div className="container-page flex min-h-dvh flex-col items-center justify-center text-center">
        <h1 className="text-display-sm">{t.admin.unauthorized}</h1>
        <Link href={routes.home} className="link-quiet mt-4 text-sm text-ink">
          {t.states.notFoundCta}
        </Link>
      </div>
    );
  }

  const driver = getRepository().driver;

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="container-page flex h-16 items-center gap-4">
          <BrandMark size="sm" className="text-ink" />
          <span className="rounded-xs bg-ink px-2 py-0.5 text-[0.625rem] tracking-[0.12em] text-canvas">
            {t.admin.title}
          </span>
          <span className="hidden text-xs text-muted sm:inline">
            driver: {driver}
          </span>
          <div className="ms-auto flex items-center gap-3">
            <Link
              href={routes.home}
              className="link-quiet inline-flex items-center gap-1.5 text-sm text-ink-soft"
            >
              <ArrowUpLeft className="size-4" />
              לאתר
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="container-page grid gap-8 py-8 lg:grid-cols-[13rem_1fr] lg:gap-12">
        <nav aria-label={t.admin.title}>
          <ul className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 text-sm lg:mx-0 lg:flex-col lg:gap-0.5 lg:px-0">
            {nav.map((item) => (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  className="block whitespace-nowrap rounded-sm px-3 py-2 text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main>{children}</main>
      </div>
    </div>
  );
}
