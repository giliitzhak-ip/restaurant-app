'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import type { CategoryRow, ServiceRow } from '@/types/database';
import { Input } from '@/components/ui/input';
import { CategoryIcon } from '@/components/ui/category-icon';
import { EmptyState } from '@/components/ui/states';
import { useDebounced } from '@/hooks/use-debounced';
import { useT } from '@/components/providers/i18n-provider';

interface Props {
  categories: CategoryRow[];
  services: ServiceRow[];
}

/**
 * Category picker with search over both categories and the services inside
 * them, so typing "נזילה" finds Plumbing even though the word is a service.
 */
export function CategoryGrid({ categories, services }: Props) {
  const t = useT();
  const [query, setQuery] = useState('');
  const search = useDebounced(query, 200).trim().toLowerCase();

  const servicesByCategory = useMemo(() => {
    const map = new Map<string, ServiceRow[]>();
    for (const service of services) {
      const list = map.get(service.category_id) ?? [];
      list.push(service);
      map.set(service.category_id, list);
    }
    return map;
  }, [services]);

  const results = useMemo(() => {
    if (!search) return categories.map((category) => ({ category, matchedService: null as ServiceRow | null }));

    const matches: Array<{ category: CategoryRow; matchedService: ServiceRow | null }> = [];
    for (const category of categories) {
      if (category.name.toLowerCase().includes(search) || category.slug.includes(search)) {
        matches.push({ category, matchedService: null });
        continue;
      }
      const service = (servicesByCategory.get(category.id) ?? []).find((entry) =>
        entry.name.toLowerCase().includes(search),
      );
      if (service) matches.push({ category, matchedService: service });
    }
    return matches;
  }, [categories, search, servicesByCategory]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute inset-y-0 my-auto size-4 text-muted-foreground start-3"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.customer.searchPlaceholder}
          aria-label={t.customer.searchPlaceholder}
          className="ps-9"
        />
      </div>

      {results.length === 0 ? (
        <EmptyState title={t.empty.noResults} description="נסה מילה אחרת, או בחר ״אחר״ ותאר בעצמך." />
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {results.map(({ category, matchedService }) => (
            <li key={category.id}>
              <Link
                href={
                  matchedService
                    ? `/app/new?category=${category.slug}&service=${matchedService.slug}`
                    : `/app/new?category=${category.slug}`
                }
                className="flex h-full flex-col items-center gap-2 rounded-xl border bg-card p-3 text-center transition-colors hover:border-accent/60"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-accent/10 text-accent">
                  <CategoryIcon name={category.icon} />
                </span>
                <span className="text-xs font-medium leading-tight">{category.name}</span>
                {matchedService ? (
                  <span className="text-[10px] text-accent">{matchedService.name}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
