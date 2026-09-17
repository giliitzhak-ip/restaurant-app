'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Unread/pending count shown as a small badge. */
  badge?: number;
}

/**
 * Mobile bottom navigation. Hidden from `md` up, where the sidebar takes over.
 */
export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="ניווט תחתון"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                  active ? 'text-accent' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="relative">
                  <Icon className="size-5" aria-hidden />
                  {item.badge ? (
                    <span className="num absolute -end-2 -top-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  ) : null}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Desktop counterpart: a persistent sidebar. */
export function SideNav({ items, title }: { items: NavItem[]; title?: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="ניווט צדדי" className="hidden w-56 shrink-0 md:block">
      {title ? (
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
      ) : null}
      <ul className="space-y-1">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:bg-secondary',
                )}
              >
                <Icon className="size-4" aria-hidden />
                <span className="flex-1">{item.label}</span>
                {item.badge ? (
                  <span className="num rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
