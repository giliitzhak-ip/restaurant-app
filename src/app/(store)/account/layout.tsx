import Link from "next/link";
import { redirect } from "next/navigation";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getSessionUser } from "@/server/auth/session";
import { LogoutButton } from "@/features/account/logout-button";

const nav = [
  { href: routes.account.root, label: t.account.title },
  { href: routes.account.designs, label: t.account.designs },
  { href: routes.account.orders, label: t.account.orders },
  { href: routes.account.quotes, label: t.account.quotes },
  { href: routes.account.favorites, label: t.account.favorites },
  { href: routes.account.profile, label: t.account.profile },
];

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect(`${routes.login}?next=${encodeURIComponent(routes.account.root)}`);
  }

  return (
    <div className="container-page py-8 md:py-12">
      <Breadcrumbs items={[{ label: t.account.title, href: routes.account.root }]} />
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-display-sm">{t.account.title}</h1>
          <p className="mt-2 text-sm text-muted">
            {user.fullName} · {user.email}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {user.role === "ADMIN" ? (
            <Link href={routes.admin.root} className="link-quiet text-sm text-brass">
              {t.nav.admin}
            </Link>
          ) : null}
          <LogoutButton />
        </div>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[14rem_1fr] lg:gap-14">
        <nav aria-label={t.account.title}>
          <ul className="scrollbar-none -mx-4 flex gap-4 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:gap-1 lg:px-0">
            {nav.map((item) => (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  className="block whitespace-nowrap rounded-sm px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>{children}</div>
      </div>
    </div>
  );
}
