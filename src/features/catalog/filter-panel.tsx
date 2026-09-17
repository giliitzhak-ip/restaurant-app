"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { t } from "@/i18n";

import { formatPrice } from "@/lib/format";
import { track } from "@/lib/analytics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  availabilityLabels,
  materialLabels,
  styleLabels,
  toneLabels,
  usageLabels,
  waterLabels,
} from "@/features/catalog/labels";
import { sizeLabel } from "@/server/repositories/filter";
import {
  buildQueryString,
  countActiveFilters,
  filterKeys,
  type CatalogSearchState,
} from "@/features/catalog/search-params";
import type { CatalogFacets } from "@/server/repositories/types";

interface FilterPanelProps {
  facets: CatalogFacets;
  state: CatalogSearchState;
  /** Set when the page already scopes a category (category landing pages). */
  lockedCategory?: string;
  lockedCollection?: string;
  resultCount: number;
}

export function FilterPanel(props: FilterPanelProps) {
  const [open, setOpen] = React.useState(false);
  const active = countActiveFilters(props.state);

  return (
    <>
      {/* mobile trigger */}
      <div className="sticky top-16 z-20 -mx-4 mb-6 flex items-center gap-2 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur-md lg:hidden">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="gap-2"
        >
          <SlidersHorizontal />
          {t.catalog.filters}
          {active > 0 ? <Badge variant="ink">{active}</Badge> : null}
        </Button>
        <SortSelect />
        <span className="num ms-auto text-xs text-muted">
          {t.catalog.resultsCount(props.resultCount)}
        </span>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[88dvh]">
          <SheetHeader>
            <SheetTitle>{t.catalog.filtersTitle}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <FilterGroups {...props} />
          </SheetBody>
          <SheetFooter className="flex gap-2">
            <Button block onClick={() => setOpen(false)}>
              {t.catalog.showResults(props.resultCount)}
            </Button>
            <ClearAll />
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* desktop sidebar */}
      <div className="hidden lg:block">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink">{t.catalog.filters}</h2>
          {active > 0 ? <ClearAll compact /> : null}
        </div>
        <FilterGroups {...props} />
      </div>
    </>
  );
}

function useToggle() {
  const router = useRouter();
  const params = useSearchParams();

  return React.useCallback(
    (key: string, value: string, current: string[]) => {
      const next = current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value];
      track("filter_catalog", { facet: key, value });
      router.push(buildQueryString(params, { [key]: next.length ? next : null }), {
        scroll: false,
      });
    },
    [params, router],
  );
}

function CheckboxRow({
  id,
  label,
  count,
  checked,
  onChange,
  swatch,
}: {
  id: string;
  label: string;
  count?: number;
  checked: boolean;
  onChange: () => void;
  swatch?: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-2.5 py-1.5 text-sm text-ink-soft transition-colors hover:text-ink"
    >
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} />
      {swatch ? (
        <span
          className="size-4 shrink-0 rounded-full border border-line-strong"
          style={{ backgroundColor: swatch }}
          aria-hidden
        />
      ) : null}
      <span className="flex-1">{label}</span>
      {count !== undefined ? (
        <span className="num text-xs text-muted-soft">{count}</span>
      ) : null}
    </label>
  );
}

function FilterGroups({
  facets,
  state,
  lockedCategory,
  lockedCollection,
}: FilterPanelProps) {
  const toggle = useToggle();
  const router = useRouter();
  const params = useSearchParams();

  const setRange = (key: string, value: string) => {
    router.push(buildQueryString(params, { [key]: value || null }), { scroll: false });
  };

  const groups: { id: string; title: string; body: React.ReactNode }[] = [];

  if (!lockedCategory) {
    groups.push({
      id: "category",
      title: t.catalog.groupCategory,
      body: (
        <div>
          {facets.categories.map((facet) => (
            <CheckboxRow
              key={facet.slug}
              id={`cat-${facet.slug}`}
              label={facet.name}
              count={facet.count}
              checked={state.categories?.includes(facet.slug) ?? false}
              onChange={() =>
                toggle(filterKeys.category, facet.slug, state.categories ?? [])
              }
            />
          ))}
        </div>
      ),
    });
  }

  groups.push({
    id: "surface",
    title: t.catalog.groupSurface,
    body: (
      <div>
        {(["FLOOR", "WALL"] as const).map((surface) => (
          <CheckboxRow
            key={surface}
            id={`surface-${surface}`}
            label={surface === "FLOOR" ? "רצפה" : "קיר"}
            checked={state.surfaces?.includes(surface) ?? false}
            onChange={() =>
              toggle(filterKeys.surface, surface, state.surfaces ?? [])
            }
          />
        ))}
      </div>
    ),
  });

  groups.push({
    id: "tone",
    title: t.catalog.groupTone,
    body: (
      <div>
        {facets.tones.map((facet) => (
          <CheckboxRow
            key={facet.value}
            id={`tone-${facet.value}`}
            label={toneLabels[facet.value]}
            count={facet.count}
            checked={state.tones?.includes(facet.value) ?? false}
            onChange={() => toggle(filterKeys.tone, facet.value, state.tones ?? [])}
          />
        ))}
      </div>
    ),
  });

  groups.push({
    id: "color",
    title: t.catalog.groupColor,
    body: (
      <div className="max-h-64 overflow-y-auto pe-1">
        {facets.colors.map((facet) => (
          <CheckboxRow
            key={facet.value}
            id={`color-${facet.value}`}
            label={facet.value}
            count={facet.count}
            swatch={facet.hex}
            checked={state.colors?.includes(facet.value) ?? false}
            onChange={() => toggle(filterKeys.color, facet.value, state.colors ?? [])}
          />
        ))}
      </div>
    ),
  });

  groups.push({
    id: "material",
    title: t.catalog.groupMaterial,
    body: (
      <div>
        {facets.materials.map((facet) => (
          <CheckboxRow
            key={facet.value}
            id={`mat-${facet.value}`}
            label={materialLabels[facet.value]}
            count={facet.count}
            checked={state.materials?.includes(facet.value) ?? false}
            onChange={() =>
              toggle(filterKeys.material, facet.value, state.materials ?? [])
            }
          />
        ))}
      </div>
    ),
  });

  groups.push({
    id: "style",
    title: t.catalog.groupStyle,
    body: (
      <div>
        {facets.styles.map((facet) => (
          <CheckboxRow
            key={facet.value}
            id={`style-${facet.value}`}
            label={styleLabels[facet.value]}
            count={facet.count}
            checked={state.styles?.includes(facet.value) ?? false}
            onChange={() => toggle(filterKeys.style, facet.value, state.styles ?? [])}
          />
        ))}
      </div>
    ),
  });

  groups.push({
    id: "price",
    title: t.catalog.groupPrice,
    body: (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={facets.price.min}
            max={facets.price.max}
            placeholder={String(facets.price.min)}
            defaultValue={state.priceMin ?? ""}
            aria-label="מחיר מינימלי"
            onBlur={(event) => setRange(filterKeys.priceMin, event.target.value)}
            className="num h-10"
          />
          <span className="text-muted">–</span>
          <Input
            type="number"
            inputMode="numeric"
            min={facets.price.min}
            max={facets.price.max}
            placeholder={String(facets.price.max)}
            defaultValue={state.priceMax ?? ""}
            aria-label="מחיר מקסימלי"
            onBlur={(event) => setRange(filterKeys.priceMax, event.target.value)}
            className="num h-10"
          />
        </div>
        <p className="num text-xs text-muted">
          {formatPrice(facets.price.min)} – {formatPrice(facets.price.max)} למ״ר
        </p>
      </div>
    ),
  });

  groups.push({
    id: "size",
    title: t.catalog.groupSize,
    body: (
      <div className="max-h-64 overflow-y-auto pe-1">
        {facets.sizes.map((facet) => (
          <CheckboxRow
            key={facet.value}
            id={`size-${facet.value}`}
            label={sizeLabel(facet.value)}
            count={facet.count}
            checked={state.sizes?.includes(facet.value) ?? false}
            onChange={() => toggle(filterKeys.size, facet.value, state.sizes ?? [])}
          />
        ))}
      </div>
    ),
  });

  groups.push({
    id: "thickness",
    title: t.catalog.groupThickness,
    body: (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          step="0.5"
          placeholder={String(facets.thickness.min)}
          defaultValue={state.thicknessMin ?? ""}
          aria-label="עובי מינימלי"
          onBlur={(event) => setRange(filterKeys.thicknessMin, event.target.value)}
          className="num h-10"
        />
        <span className="text-muted">–</span>
        <Input
          type="number"
          inputMode="decimal"
          step="0.5"
          placeholder={String(facets.thickness.max)}
          defaultValue={state.thicknessMax ?? ""}
          aria-label="עובי מקסימלי"
          onBlur={(event) => setRange(filterKeys.thicknessMax, event.target.value)}
          className="num h-10"
        />
        <span className="text-xs text-muted">מ״מ</span>
      </div>
    ),
  });

  groups.push({
    id: "water",
    title: t.catalog.groupWater,
    body: (
      <div>
        {facets.water.map((facet) => (
          <CheckboxRow
            key={facet.value}
            id={`water-${facet.value}`}
            label={waterLabels[facet.value]}
            count={facet.count}
            checked={state.water?.includes(facet.value) ?? false}
            onChange={() => toggle(filterKeys.water, facet.value, state.water ?? [])}
          />
        ))}
      </div>
    ),
  });

  groups.push({
    id: "usage",
    title: t.catalog.groupUsage,
    body: (
      <div>
        {(["INDOOR", "OUTDOOR"] as const).map((usage) => (
          <CheckboxRow
            key={usage}
            id={`usage-${usage}`}
            label={usageLabels[usage]}
            checked={state.usage?.includes(usage) ?? false}
            onChange={() => toggle(filterKeys.usage, usage, state.usage ?? [])}
          />
        ))}
      </div>
    ),
  });

  groups.push({
    id: "availability",
    title: t.catalog.groupAvailability,
    body: (
      <div>
        {facets.availability.map((facet) => (
          <CheckboxRow
            key={facet.value}
            id={`avail-${facet.value}`}
            label={availabilityLabels[facet.value]}
            count={facet.count}
            checked={state.availability?.includes(facet.value) ?? false}
            onChange={() =>
              toggle(filterKeys.availability, facet.value, state.availability ?? [])
            }
          />
        ))}
      </div>
    ),
  });

  if (!lockedCollection && facets.collections.length > 1) {
    groups.push({
      id: "collection",
      title: t.nav.collections,
      body: (
        <div>
          {facets.collections.map((facet) => (
            <CheckboxRow
              key={facet.slug}
              id={`col-${facet.slug}`}
              label={facet.name}
              count={facet.count}
              checked={state.collections?.includes(facet.slug) ?? false}
              onChange={() =>
                toggle(filterKeys.collection, facet.slug, state.collections ?? [])
              }
            />
          ))}
        </div>
      ),
    });
  }

  groups.push({
    id: "brand",
    title: t.catalog.groupBrand,
    body: (
      <div>
        {facets.brands.map((facet) => (
          <CheckboxRow
            key={facet.value}
            id={`brand-${facet.value}`}
            label={facet.value}
            count={facet.count}
            checked={state.brands?.includes(facet.value) ?? false}
            onChange={() => toggle(filterKeys.brand, facet.value, state.brands ?? [])}
          />
        ))}
      </div>
    ),
  });

  return (
    <Accordion
      type="multiple"
      defaultValue={["category", "surface", "tone", "price"]}
      className="border-t border-line"
    >
      {groups.map((group) => (
        <AccordionItem key={group.id} value={group.id}>
          <AccordionTrigger className="text-sm">{group.title}</AccordionTrigger>
          <AccordionContent className="pe-0">{group.body}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export function ClearAll({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const sort = params.get(filterKeys.sort);
  const search = params.get(filterKeys.search);

  return (
    <Button
      variant={compact ? "link" : "outline"}
      size={compact ? "sm" : "md"}
      onClick={() => {
        const next = new URLSearchParams();
        if (sort) next.set(filterKeys.sort, sort);
        if (search) next.set(filterKeys.search, search);
        const query = next.toString();
        router.push(query ? `?${query}` : "?", { scroll: false });
      }}
      className={compact ? "text-xs text-muted" : undefined}
    >
      {t.common.clearAll}
    </Button>
  );
}

export function SortSelect() {
  const router = useRouter();
  const params = useSearchParams();
  const value = params.get(filterKeys.sort) ?? "popular";

  const options: { value: string; label: string }[] = [
    { value: "popular", label: t.catalog.sortPopular },
    { value: "new", label: t.catalog.sortNew },
    { value: "price-asc", label: t.catalog.sortPriceAsc },
    { value: "price-desc", label: t.catalog.sortPriceDesc },
  ];

  return (
    <label className="inline-flex items-center gap-2 text-xs text-muted">
      <span className="hidden sm:inline">{t.catalog.sort}</span>
      <select
        value={value}
        onChange={(event) =>
          router.push(
            buildQueryString(params, { [filterKeys.sort]: event.target.value }),
            { scroll: false },
          )
        }
        aria-label={t.catalog.sort}
        className="h-9 rounded-sm border border-line-strong bg-surface px-2.5 text-xs text-ink focus:border-ink focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Removable chips for whatever is currently filtered. */
export function ActiveFilterChips({
  state,
  facets,
}: {
  state: CatalogSearchState;
  facets: CatalogFacets;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const chips: { key: string; value: string; label: string }[] = [];
  const push = (key: string, values: string[] | undefined, label: (v: string) => string) => {
    values?.forEach((value) => chips.push({ key, value, label: label(value) }));
  };

  push(filterKeys.category, state.categories, (value) =>
    facets.categories.find((facet) => facet.slug === value)?.name ?? value,
  );
  push(filterKeys.collection, state.collections, (value) =>
    facets.collections.find((facet) => facet.slug === value)?.name ?? value,
  );
  push(filterKeys.surface, state.surfaces, (value) =>
    value === "FLOOR" ? "רצפה" : "קיר",
  );
  push(filterKeys.tone, state.tones, (value) => toneLabels[value as keyof typeof toneLabels] ?? value);
  push(filterKeys.color, state.colors, (value) => value);
  push(
    filterKeys.material,
    state.materials,
    (value) => materialLabels[value as keyof typeof materialLabels] ?? value,
  );
  push(
    filterKeys.style,
    state.styles,
    (value) => styleLabels[value as keyof typeof styleLabels] ?? value,
  );
  push(filterKeys.size, state.sizes, (value) => sizeLabel(value));
  push(
    filterKeys.water,
    state.water,
    (value) => waterLabels[value as keyof typeof waterLabels] ?? value,
  );
  push(
    filterKeys.usage,
    state.usage,
    (value) => usageLabels[value as keyof typeof usageLabels] ?? value,
  );
  push(
    filterKeys.availability,
    state.availability,
    (value) => availabilityLabels[value as keyof typeof availabilityLabels] ?? value,
  );
  push(filterKeys.brand, state.brands, (value) => value);

  if (!chips.length) return null;

  return (
    <ul className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <li key={`${chip.key}-${chip.value}`}>
          <button
            type="button"
            onClick={() => {
              const current = params.get(chip.key)?.split(",") ?? [];
              const next = current.filter((entry) => entry !== chip.value);
              router.push(
                buildQueryString(params, { [chip.key]: next.length ? next : null }),
                { scroll: false },
              );
            }}
            className="inline-flex items-center gap-1.5 rounded-xs border border-line-strong bg-surface px-2.5 py-1.5 text-xs text-ink-soft transition-colors hover:border-ink hover:text-ink"
          >
            {chip.label}
            <X className="size-3" />
          </button>
        </li>
      ))}
      <li>
        <ClearAll compact />
      </li>
    </ul>
  );
}
