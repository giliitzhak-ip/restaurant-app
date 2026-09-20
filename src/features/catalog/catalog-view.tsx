import Link from "next/link";
import { PackageOpen } from "lucide-react";
import { t } from "@/i18n";
import { Breadcrumbs, type Crumb } from "@/components/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/features/catalog/product-card";
import {
  ActiveFilterChips,
  FilterPanel,
  SortSelect,
} from "@/features/catalog/filter-panel";
import { PAGE_SIZE, type CatalogSearchState } from "@/features/catalog/search-params";
import type { CatalogFacets, ProductPage } from "@/server/repositories/types";

/**
 * One catalogue surface, reused by /catalog, a category landing page and a
 * collection page. Filters are server-rendered from the URL, so the first
 * paint already shows the right products.
 */
export function CatalogView({
  title,
  subtitle,
  crumbs,
  facets,
  state,
  results,
  lockedCategory,
  lockedCollection,
  basePath,
  intro,
}: {
  title: string;
  subtitle?: string;
  crumbs: Crumb[];
  facets: CatalogFacets;
  state: CatalogSearchState;
  results: ProductPage;
  lockedCategory?: string;
  lockedCollection?: string;
  basePath: string;
  intro?: React.ReactNode;
}) {
  const totalPages = Math.max(1, Math.ceil(results.total / PAGE_SIZE));

  return (
    <div className="container-page py-8 md:py-12">
      <Breadcrumbs items={crumbs} />

      <header className="mt-6 max-w-3xl">
        <h1 className="text-display-sm">{title}</h1>
        {subtitle ? (
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">{subtitle}</p>
        ) : null}
      </header>

      {intro}

      <div className="mt-8 grid gap-10 lg:mt-12 lg:grid-cols-[17rem_1fr] lg:gap-12">
        <aside className="lg:sticky lg:top-24 lg:h-fit lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:pe-2">
          <FilterPanel
            facets={facets}
            state={state}
            lockedCategory={lockedCategory}
            lockedCollection={lockedCollection}
            resultCount={results.total}
          />
        </aside>

        <div>
          <div className="mb-6 hidden items-center justify-between gap-4 lg:flex">
            <p className="num text-sm text-muted">
              {t.catalog.resultsCount(results.total)}
            </p>
            <SortSelect />
          </div>

          <div className="mb-6">
            <ActiveFilterChips state={state} facets={facets} />
          </div>

          {results.items.length === 0 ? (
            <EmptyState
              icon={<PackageOpen />}
              title={t.catalog.noResultsTitle}
              body={t.catalog.noResultsBody}
              action={
                <Button asChild variant="outline">
                  <Link href={basePath}>{t.common.clearAll}</Link>
                </Button>
              }
            />
          ) : (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 md:gap-x-6 md:gap-y-12">
              {results.items.map((product, index) => (
                <li key={product.id}>
                  <ProductCard
                    product={product}
                    priority={index < 4}
                    index={index}
                  />
                </li>
              ))}
            </ul>
          )}

          {totalPages > 1 ? (
            <Pagination
              page={state.page}
              totalPages={totalPages}
              basePath={basePath}
              state={state}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  basePath,
  state,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  state: CatalogSearchState;
}) {
  const href = (target: number) => {
    const params = new URLSearchParams();
    const add = (key: string, values?: string[]) => {
      if (values?.length) params.set(key, values.join(","));
    };
    add("cat", state.categories);
    add("col", state.collections);
    add("tone", state.tones);
    add("mat", state.materials);
    add("style", state.styles);
    add("color", state.colors);
    add("brand", state.brands);
    add("size", state.sizes);
    add("surface", state.surfaces);
    add("water", state.water);
    add("usage", state.usage);
    add("avail", state.availability);
    if (state.priceMin !== undefined) params.set("pmin", String(state.priceMin));
    if (state.priceMax !== undefined) params.set("pmax", String(state.priceMax));
    if (state.thicknessMin !== undefined) params.set("thmin", String(state.thicknessMin));
    if (state.thicknessMax !== undefined) params.set("thmax", String(state.thicknessMax));
    if (state.search) params.set("q", state.search);
    if (state.sort && state.sort !== "popular") params.set("sort", state.sort);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return `${basePath}${query ? `?${query}` : ""}`;
  };

  const pages = Array.from({ length: totalPages }, (_, index) => index + 1).filter(
    (value) =>
      value === 1 ||
      value === totalPages ||
      Math.abs(value - page) <= 1,
  );

  return (
    <nav aria-label="דפי תוצאות" className="mt-14 flex items-center justify-center gap-1.5">
      {page > 1 ? (
        <Button asChild variant="outline" size="sm" className="text-xs">
          <Link href={href(page - 1)}>{t.common.previous}</Link>
        </Button>
      ) : null}
      {pages.map((value, index) => (
        <span key={value} className="flex items-center gap-1.5">
          {index > 0 && value - pages[index - 1]! > 1 ? (
            <span className="px-1 text-xs text-muted-soft">…</span>
          ) : null}
          <Button
            asChild
            size="sm"
            variant={value === page ? "primary" : "outline"}
            className="num min-w-9 px-3 text-xs"
          >
            <Link
              href={href(value)}
              aria-current={value === page ? "page" : undefined}
            >
              {value}
            </Link>
          </Button>
        </span>
      ))}
      {page < totalPages ? (
        <Button asChild variant="outline" size="sm" className="text-xs">
          <Link href={href(page + 1)}>{t.common.next}</Link>
        </Button>
      ) : null}
    </nav>
  );
}
