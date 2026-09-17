'use client';

import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import type { CategoryRow } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { ProviderCard } from '@/components/ui/provider-card';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/states';
import { useApi } from '@/hooks/use-api';
import { useDebounced } from '@/hooks/use-debounced';
import { useGeolocation } from '@/hooks/use-geolocation';
import { useT } from '@/components/providers/i18n-provider';

interface ProviderResult {
  id: string;
  businessName: string;
  avatarUrl: string | null;
  basePrice: number | null;
  ratingAvg: number;
  ratingCount: number;
  completedJobs: number;
  distanceKm: number | null;
  etaMinutes: number | null;
  isAvailable: boolean;
  isVerified: boolean;
  categories: Array<{ id: string; name: string }>;
}

type Sort = 'recommended' | 'distance' | 'rating' | 'price' | 'response_time';

/** Provider directory with debounced search and a filter drawer. */
export function ProviderSearch({ categories }: { categories: CategoryRow[] }) {
  const t = useT();
  const geo = useGeolocation();

  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [minRating, setMinRating] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [maxDistanceKm, setMaxDistanceKm] = useState('');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sort, setSort] = useState<Sort>('recommended');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const debouncedQuery = useDebounced(query, 350);

  const url = useMemo(() => {
    const params = new URLSearchParams({ sort, pageSize: '30' });
    if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim());
    if (categoryId) params.set('categoryId', categoryId);
    if (minRating) params.set('minRating', minRating);
    if (maxPrice) params.set('maxPrice', maxPrice);
    if (maxDistanceKm) params.set('maxDistanceKm', maxDistanceKm);
    if (availableOnly) params.set('availableOnly', 'true');
    if (geo.position) {
      params.set('lat', String(geo.position.lat));
      params.set('lng', String(geo.position.lng));
    }
    return `/api/providers/search?${params.toString()}`;
  }, [debouncedQuery, categoryId, minRating, maxPrice, maxDistanceKm, availableOnly, sort, geo.position]);

  const { data, loading, error, reload } = useApi<{ providers: ProviderResult[]; total: number }>(url);
  const providers = data?.providers ?? [];

  const activeFilterCount = [categoryId, minRating, maxPrice, maxDistanceKm].filter(Boolean).length +
    (availableOnly ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute inset-y-0 my-auto size-4 text-muted-foreground start-3"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.customer.searchPlaceholder}
            aria-label={t.search.title}
            className="ps-9"
          />
        </div>
        <Button variant="outline" onClick={() => setFiltersOpen(true)}>
          <SlidersHorizontal aria-hidden />
          {t.search.filters}
          {activeFilterCount ? <span className="num">({activeFilterCount})</span> : null}
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t.search.sortBy}</span>
          <Select
            value={sort}
            onChange={(event) => setSort(event.target.value as Sort)}
            className="h-9 w-auto"
            aria-label={t.search.sortBy}
          >
            {(Object.keys(t.search.sort) as Array<keyof typeof t.search.sort>).map((key) => (
              <option key={key} value={key}>
                {t.search.sort[key]}
              </option>
            ))}
          </Select>
        </label>

        {!geo.position ? (
          <Button variant="ghost" size="sm" onClick={() => geo.request()}>
            {t.wizard.useGps}
          </Button>
        ) : null}
      </div>

      {loading && !data ? (
        <SkeletonList rows={4} />
      ) : error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : providers.length === 0 ? (
        <EmptyState title={t.empty.noProviders} description="נסה להרחיב את המסננים או לבחור תחום אחר." />
      ) : (
        <ul className="space-y-3">
          {providers.map((provider) => (
            <li key={provider.id}>
              <ProviderCard
                href={`/app/providers/${provider.id}`}
                provider={{
                  id: provider.id,
                  businessName: provider.businessName,
                  avatarUrl: provider.avatarUrl,
                  categories: provider.categories.map((category) => category.name),
                  ratingAvg: provider.ratingAvg,
                  ratingCount: provider.ratingCount,
                  completedJobs: provider.completedJobs,
                  distanceKm: provider.distanceKm,
                  etaMinutes: provider.etaMinutes,
                  basePrice: provider.basePrice,
                  isVerified: provider.isVerified,
                  isAvailable: provider.isAvailable,
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={t.search.filters}
        footer={
          <>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setCategoryId('');
                setMinRating('');
                setMaxPrice('');
                setMaxDistanceKm('');
                setAvailableOnly(false);
              }}
            >
              איפוס
            </Button>
            <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
              {t.common.confirm}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t.search.category} htmlFor="filter-category">
            <Select
              id="filter-category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">{t.common.all}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t.search.minRating} htmlFor="filter-rating">
            <Select id="filter-rating" value={minRating} onChange={(event) => setMinRating(event.target.value)}>
              <option value="">{t.common.all}</option>
              {[3, 3.5, 4, 4.5].map((value) => (
                <option key={value} value={value}>
                  {value}+
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t.search.maxPrice} htmlFor="filter-price">
            <Input
              id="filter-price"
              type="number"
              min={0}
              dir="ltr"
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
            />
          </Field>

          <Field
            label={t.search.distance}
            htmlFor="filter-distance"
            hint={geo.position ? undefined : 'דרוש מיקום כדי לסנן לפי מרחק'}
          >
            <Input
              id="filter-distance"
              type="number"
              min={1}
              dir="ltr"
              disabled={!geo.position}
              value={maxDistanceKm}
              onChange={(event) => setMaxDistanceKm(event.target.value)}
            />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={availableOnly}
              onChange={(event) => setAvailableOnly(event.target.checked)}
              className="size-4 rounded border-input"
            />
            {t.search.availableOnly}
          </label>

          <p className="text-xs text-muted-foreground">{t.search.verifiedOnly} — תמיד פעיל.</p>
        </div>
      </Sheet>
    </div>
  );
}
