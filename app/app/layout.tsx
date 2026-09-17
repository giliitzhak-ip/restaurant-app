import { redirect } from 'next/navigation';
import { Briefcase, Heart, Home, MessageSquare, User } from 'lucide-react';
import { AppHeader } from '@/components/layout/app-header';
import { BottomNav, SideNav, type NavItem } from '@/components/layout/bottom-nav';
import { getSessionContext, homePathFor } from '@/lib/auth/session';
import { getServerDictionary } from '@/lib/i18n/server';
import { isSupabaseConfigured } from '@/lib/env';
import { DemoNotice } from '@/features/auth/components/demo-notice';

/**
 * Customer area shell.
 *
 * This is the authoritative role check for everything under /app — middleware
 * only guarantees that *someone* is signed in.
 */
export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) {
    return (
      <main id="main" className="container-page py-10">
        <DemoNotice />
      </main>
    );
  }

  const session = await getSessionContext();
  if (!session) redirect('/login?next=/app');
  if (session.role !== 'customer') redirect(homePathFor(session.role));

  const { t } = await getServerDictionary();

  const items: NavItem[] = [
    { href: '/app', label: t.nav.home, icon: Home },
    { href: '/app/jobs', label: t.nav.jobs, icon: Briefcase },
    { href: '/app/messages', label: t.nav.messages, icon: MessageSquare },
    { href: '/app/favorites', label: t.nav.favorites, icon: Heart },
    { href: '/app/profile', label: t.nav.profile, icon: User },
  ];

  return (
    <div className="min-h-dvh bg-brand-surface">
      <AppHeader
        userId={session.userId}
        fullName={session.fullName}
        avatarUrl={session.avatarUrl}
        profileHref="/app/profile"
        homeHref="/app"
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
