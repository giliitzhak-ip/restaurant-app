'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { activeNavHref, NAV_ITEMS, type NavKey } from './nav-config';

export function NavLinks({
  labels,
  onNavigate,
}: {
  labels: Record<NavKey, string>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = activeNavHref(pathname);

  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ key, href, icon: Icon }) => {
        const isActive = href === active;
        return (
          <li key={key}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent text-gold-200 before:absolute before:inset-y-2 before:start-0 before:w-0.5 before:rounded-full before:bg-gold-400'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon
                className={cn('size-[1.125rem] shrink-0', isActive ? 'text-gold-400' : '')}
                aria-hidden
              />
              <span>{labels[key]}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
