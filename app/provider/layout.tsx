import { redirect } from 'next/navigation';
import { Briefcase, Home, MessageSquare, User, Wallet } from 'lucide-react';
import { AppHeader } from '@/components/layout/app-header';
import { BottomNav, SideNav, type NavItem } from '@/components/layout/bottom-nav';
import { getSessionContext, homePathFor } from '@/lib/auth/session';
import { getServerDictionary } from '@/lib/i18n/server';
import { isSupabaseConfigured } from '@/lib/env';
import { DemoNotice } from '@/features/auth/components/demo-notice';

/** Provider area shell — the authoritative role check for everything under /provider. */
export default async function ProviderLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) {
    return (
      <main id="main" className="container-page py-10">
        <DemoNotice />
      </main>
    );
  }

  const session = await getSessionContext();
  if (!session) redirect('/login?next=/provider');
  if (session.role !== 'provider') redirect(homePathFor(session.role));

  const { t } = await getServerDictionary();

  const items: NavItem[] = [
    { href: '/provider', label: t.nav.home, icon: Home },
    { href: '/provider/jobs', label: t.nav.jobs, icon: Briefcase },
    { href: '/provider/messages', label: t.nav.messages, icon: MessageSquare },
    { href: '/provider/earnings', label: t.nav.earnings, icon: Wallet },
    { href: '/provider/profile', label: t.nav.profile, icon: User },
  ];

  return (
    <div className="min-h-dvh bg-brand-surface">
      <AppHeader
        userId={session.userId}
        fullName={session.fullName}
        avatarUrl={session.avatarUrl}
        profileHref="/provider/profile"
        homeHref="/provider"
      />
      <div className="container-wide flex gap-6 py-4 md:py-6">
        <SideNav items={items} />
        <main id="main" className="min-w-0 flex-1 pb-nav md:pb-0">
          {children}
        </main>
      </div>
      <BottomNav items={items} />
    </div>
  );
}
