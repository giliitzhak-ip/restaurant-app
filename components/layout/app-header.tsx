import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { NotificationBell } from './notification-bell';
import { LocaleSwitcher } from './locale-switcher';

interface AppHeaderProps {
  userId: string;
  fullName: string;
  avatarUrl?: string | null;
  profileHref: string;
  homeHref: string;
}

export function AppHeader({ userId, fullName, avatarUrl, profileHref, homeHref }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="container-wide flex h-14 items-center justify-between gap-2">
        <Logo size="sm" href={homeHref} />
        <div className="flex items-center gap-1">
          <LocaleSwitcher />
          <NotificationBell userId={userId} />
          <Link href={profileHref} aria-label="הפרופיל שלי" className="rounded-full">
            <Avatar src={avatarUrl} name={fullName} size="sm" />
          </Link>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="ghost" size="icon" aria-label="התנתקות">
              <LogOut aria-hidden />
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
