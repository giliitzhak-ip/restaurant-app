import type { ReactNode } from 'react';
import type { Dictionary } from '@/lib/i18n/config';
import { Brand } from './brand';
import { MobileNav } from './mobile-nav';
import { NAV_ITEMS, type NavKey } from './nav-config';
import { NavLinks } from './nav-links';
import { UserPanel } from './user-panel';

export function AppShell({
  t,
  user,
  children,
}: {
  t: Dictionary;
  user: { name: string; email: string };
  children: ReactNode;
}) {
  const labels = Object.fromEntries(NAV_ITEMS.map(({ key }) => [key, t.nav[key]])) as Record<
    NavKey,
    string
  >;
  const userPanel = (
    <UserPanel
      name={user.name}
      email={user.email}
      signedInAs={t.nav.signedInAs}
      logoutLabel={t.nav.logout}
    />
  );

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        {t.common.skipToContent}
      </a>

      {/* Desktop sidebar — sits on the inline-start edge (right side in Hebrew). */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-border bg-surface lg:flex">
        <div className="flex h-16 items-center px-5">
          <Brand />
        </div>
        <nav
          aria-label={t.nav.label}
          className="flex-1 overflow-y-auto px-3 py-2"
          data-testid="desktop-nav"
        >
          <NavLinks labels={labels} />
        </nav>
        <div className="p-3">{userPanel}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/85 px-3 safe-area-pt backdrop-blur-md lg:hidden">
          <MobileNav
            labels={labels}
            openLabel={t.nav.openMenu}
            closeLabel={t.nav.closeMenu}
            navLabel={t.nav.label}
            brand={<Brand />}
            footer={userPanel}
          />
          <Brand />
          <span className="size-11" aria-hidden />
        </header>

        <main
          id="main"
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 safe-area-pb sm:px-6 lg:px-10 lg:py-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
