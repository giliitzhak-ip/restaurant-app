'use client';

import { Menu } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { NavLinks } from './nav-links';
import type { NavKey } from './nav-config';

export function MobileNav({
  labels,
  openLabel,
  closeLabel,
  navLabel,
  brand,
  footer,
}: {
  labels: Record<NavKey, string>;
  openLabel: string;
  closeLabel: string;
  navLabel: string;
  brand: ReactNode;
  footer: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={openLabel} data-testid="mobile-menu-button">
          <Menu className="size-6" />
        </Button>
      </SheetTrigger>
      <SheetContent closeLabel={closeLabel}>
        <SheetTitle className="sr-only">{navLabel}</SheetTitle>
        <SheetDescription className="sr-only">{navLabel}</SheetDescription>
        <div className="flex h-16 items-center border-b border-border px-4">{brand}</div>
        <nav aria-label={navLabel} className="flex-1 overflow-y-auto p-3">
          <NavLinks labels={labels} onNavigate={() => setOpen(false)} />
        </nav>
        <div className="border-t border-border p-3">{footer}</div>
      </SheetContent>
    </Sheet>
  );
}
