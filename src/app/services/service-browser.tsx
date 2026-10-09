'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  AirVent,
  Bug,
  Droplets,
  KeyRound,
  Leaf,
  Sparkles,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export interface BrowseService {
  slug: string;
  name: string;
  price: number | null;
}

export interface BrowseCategory {
  slug: string;
  name: string;
  serviceCount: number;
  services: BrowseService[];
}

/**
 * One icon per trade, by slug.
 *
 * A map rather than a column, because an icon is a property of this
 * interface and not of the catalogue: adding a trade should not require a
 * migration to decide what it looks like. `Wrench` is the fallback, so a
 * trade approved through the proposal queue tomorrow renders sensibly today
 * instead of leaving a hole in the grid.
 */
const ICONS: Record<string, LucideIcon> = {
  plumbing: Droplets,
  electrical: Zap,
  air_conditioning: AirVent,
  gardening: Leaf,
  pest_control: Bug,
  locksmith: KeyRound,
  cleaning: Sparkles,
};

const shekels = (n: number) => '₪' + n.toLocaleString('he-IL');

function priceRange(services: BrowseService[]): string | null {
  const prices = services.map((s) => s.price).filter((p): p is number => p !== null);
  if (prices.length === 0) return null;
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  return low === high ? shekels(low) : `${shekels(low)}–${shekels(high)}`;
}

/**
 * The grid, and what opens underneath it.
 *
 * Tapping a tile expands its services in place rather than navigating. The
 * customer is browsing — the question is "what does this cover", and
 * answering it by taking them off the page means they lose the grid they
 * came to read. Tapping a service DOES navigate, because that is a decision
 * rather than a question.
 */
export function ServiceBrowser({ categories }: { categories: BrowseCategory[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const opened = categories.find((c) => c.slug === open) ?? null;

  const start = (service: BrowseService) => {
    // The description, not the slug: /request classifies text, and routing a
    // tap through the same classifier the typed flow uses means one code
    // path to be right about rather than two.
    const params = new URLSearchParams({ q: service.name, timing: 'NOW' });
    startTransition(() => router.push(`/request?${params.toString()}`));
  };

  return (
    <div className="mt-7">
      <ul className="grid grid-cols-2 gap-3 min-[460px]:grid-cols-3">
        {categories.map((category) => {
          const Icon = ICONS[category.slug] ?? Wrench;
          const isOpen = open === category.slug;
          return (
            <li key={category.slug}>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`panel-${category.slug}`}
                onClick={() => setOpen(isOpen ? null : category.slug)}
                className={`gs-press gs-press-tile flex min-h-[116px] w-full flex-col items-center justify-center gap-2.5 rounded-2xl border px-3 py-4 ${
                  isOpen
                    ? 'border-brand bg-brand/10'
                    : 'border-line bg-surface-1 hover:border-line-strong'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex size-11 items-center justify-center rounded-full ${
                    isOpen ? 'bg-brand/25 text-brand-bright' : 'bg-surface-3 text-brand-bright'
                  }`}
                >
                  <Icon size={21} strokeWidth={1.75} />
                </span>
                <span className="text-center text-[14.5px] font-semibold leading-tight text-ink">
                  {category.name}
                </span>
                {/* The bare number read as a price or a rating. It is a
                    count, so it says so. */}
                <span className="text-[11.5px] text-ink-3">
                  <span className="ltr-nums" dir="ltr">
                    {category.serviceCount}
                  </span>{' '}
                  שירותים
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/*
        One panel below the grid rather than one per tile: on a phone the grid
        is three columns, so expanding inside a cell would either squeeze the
        list into a third of the width or reflow every tile below it on every
        tap. A single panel keeps the grid still.
      */}
      {opened && (
        <section
          id={`panel-${opened.slug}`}
          className="mt-4 rounded-2xl border border-line bg-surface-1 p-4"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-bold text-ink">{opened.name}</h2>
            {priceRange(opened.services) && (
              <span className="ltr-nums text-[13px] text-ink-3" dir="ltr">
                {priceRange(opened.services)}
              </span>
            )}
          </div>

          <ul className="mt-3 grid gap-2">
            {opened.services.map((service) => (
              <li key={service.slug}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => start(service)}
                  className="gs-press flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-line-strong bg-bg px-3.5 py-2.5 text-start hover:border-brand disabled:opacity-50"
                >
                  <span className="min-w-0 text-[14.5px] font-medium text-ink">{service.name}</span>
                  <span className="flex flex-none items-center gap-2">
                    {service.price !== null && (
                      <span className="ltr-nums text-[13px] text-ink-2" dir="ltr">
                        {shekels(service.price)}
                      </span>
                    )}
                    <span aria-hidden="true" className="text-ink-3">
                      ›
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
            בחירה בשירות פותחת בקשה חדשה עם התיאור הזה — ואפשר לערוך אותו לפני
            השליחה.
          </p>
        </section>
      )}
    </div>
  );
}
