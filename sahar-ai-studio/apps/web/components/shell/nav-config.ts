import {
  Clapperboard,
  Film,
  FolderOpen,
  LayoutDashboard,
  ListVideo,
  Mic2,
  PlusCircle,
  Settings,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import type { Dictionary } from '@/lib/i18n/config';

export type NavKey = keyof Pick<
  Dictionary['nav'],
  | 'dashboard'
  | 'newProject'
  | 'characters'
  | 'studio'
  | 'scenes'
  | 'timeline'
  | 'projects'
  | 'renders'
  | 'settings'
>;

export interface NavItem {
  key: NavKey;
  href: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'dashboard', href: '/', icon: LayoutDashboard },
  { key: 'newProject', href: '/projects/new', icon: PlusCircle },
  { key: 'characters', href: '/characters', icon: UsersRound },
  { key: 'studio', href: '/studio', icon: Mic2 },
  { key: 'scenes', href: '/scenes', icon: Clapperboard },
  { key: 'timeline', href: '/timeline', icon: Film },
  { key: 'projects', href: '/projects', icon: FolderOpen },
  { key: 'renders', href: '/renders', icon: ListVideo },
  { key: 'settings', href: '/settings', icon: Settings },
];

/** The most specific nav item matching the path (so /projects/new does not light up /projects). */
export function activeNavHref(pathname: string): string | undefined {
  let best: string | undefined;
  for (const { href } of NAV_ITEMS) {
    const matches =
      href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (!best || href.length > best.length)) best = href;
  }
  return best;
}
