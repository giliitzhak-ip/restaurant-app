import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  AlertTriangle,
  BarChart3,
  Briefcase,
  CreditCard,
  LayoutGrid,
  Settings,
  ShieldCheck,
  Star,
  Users,
} from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { SideNav, type NavItem } from '@/components/layout/bottom-nav';
import { getSessionContext, homePathFor } from '@/lib/auth/session';
import { getServerDictionary } from '@/lib/i18n/server';
import { isSupabaseConfigured } from '@/lib/env';
import { DemoNotice } from '@/features/auth/components/demo-notice';

/**
 * Admin shell — desktop-first, per the product brief.
 *
 * The role check here is authoritative for every page below it; each admin API
 * route re-checks independently, and RLS restricts the data itself.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) {
    return (
      <main id="main" className="container-page py-10">
        <DemoNotice />
      </main>
    );
  }

  const session = await getSessionContext();
  if (!session) redirect('/login?next=/admin');
  if (session.role !== 'admin') redirect(homePathFor(session.role));

  const { t } = await getServerDictionary();

  const items: NavItem[] = [
    { href: '/admin', label: t.admin.overview, icon: BarChart3 },
    { href: '/admin/providers', label: t.admin.providers, icon: ShieldCheck },
    { href: '/admin/users', label: t.admin.users, icon: Users },
    { href: '/admin/jobs', label: t.admin.jobs, icon: Briefcase },
    { href: '/admin/payments', label: t.admin.payments, icon: CreditCard },
    { href: '/admin/reviews', label: t.admin.reviews, icon: Star },
    { href: '/admin/disputes', label: t.admin.disputes, icon: AlertTriangle },
    { href: '/admin/categories', label: t.admin.categories, icon: LayoutGrid },
    { href: '/admin/settings', label: t.admin.settings, icon: Settings },
  ];

  return (
    <div className="min-h-dvh bg-brand-surface">
      <header className="sticky top-0 z-30 border-b bg-background">
        <div className="container-wide flex h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo size="sm" href="/admin" />
            <span className="rounded bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
              ADMIN
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">{session.email}</span>
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="outline" size="sm">
                {t.common.logout}
              </Button>
            </form>
          </div>
        </div>
      </header>

      <div className="container-wide flex gap-6 py-6">
        {/* The sidebar is the only navigation: admin is a desktop tool. */}
        <div className="hidden md:block">
          <SideNav items={items} title={t.admin.title} />
        </div>
        <main id="main" className="min-w-0 flex-1">
          <nav aria-label={t.admin.title} className="mb-4 flex gap-2 overflow-x-auto md:hidden">
            {items.map((item) => (
              <Button key={item.href} asChild variant="outline" size="sm">
                <Link href={item.href}>{item.label}</Link>
              </Button>
            ))}
          </nav>
          {children}
        </main>
      </div>
    </div>
  );
}
