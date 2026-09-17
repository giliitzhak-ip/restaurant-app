import type {
  Availability,
  MaterialFamily,
  StyleTag,
  Tone,
  UsageArea,
  WaterResistance,
} from "@/types/catalog";
import type { ProductQuery, ProductSort } from "@/server/repositories/types";

/**
 * The catalogue filter state lives in the URL. That keeps it shareable,
 * back-button friendly and server-rendered — no client-side store, and the
 * first paint already has the right products in it.
 */
export const PAGE_SIZE = 24;

export type RawParams = Record<string, string | string[] | undefined>;

const list = (value: string | string[] | undefined): string[] => {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const number = (value: string | string[] | undefined): number | undefined => {
  const single = Array.isArray(value) ? value[0] : value;
  if (!single) return undefined;
  const parsed = Number(single);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const sorts: ProductSort[] = ["new", "popular", "price-asc", "price-desc"];

export const filterKeys = {
  category: "cat",
  collection: "col",
  tone: "tone",
  material: "mat",
  style: "style",
  color: "color",
  brand: "brand",
  size: "size",
  surface: "surface",
  water: "water",
  usage: "usage",
  availability: "avail",
  thicknessMin: "thmin",
  thicknessMax: "thmax",
  priceMin: "pmin",
  priceMax: "pmax",
  sort: "sort",
  search: "q",
  page: "page",
  sample: "sample",
} as const;

export interface CatalogSearchState extends ProductQuery {
  page: number;
}

export function parseSearchParams(params: RawParams): CatalogSearchState {
  const sortParam = Array.isArray(params[filterKeys.sort])
    ? params[filterKeys.sort]?.[0]
    : params[filterKeys.sort];
  const sort = sorts.includes(sortParam as ProductSort)
    ? (sortParam as ProductSort)
    : "popular";
  const page = Math.max(1, number(params[filterKeys.page]) ?? 1);
  const searchParam = params[filterKeys.search];
  const search = Array.isArray(searchParam) ? searchParam[0] : searchParam;

  return {
    categories: list(params[filterKeys.category]),
    collections: list(params[filterKeys.collection]),
    tones: list(params[filterKeys.tone]) as Tone[],
    materials: list(params[filterKeys.material]) as MaterialFamily[],
    styles: list(params[filterKeys.style]) as StyleTag[],
    colors: list(params[filterKeys.color]),
    brands: list(params[filterKeys.brand]),
    sizes: list(params[filterKeys.size]),
    surfaces: list(params[filterKeys.surface]) as ("FLOOR" | "WALL")[],
    water: list(params[filterKeys.water]) as WaterResistance[],
    usage: list(params[filterKeys.usage]) as UsageArea[],
    availability: list(params[filterKeys.availability]) as Availability[],
    thicknessMin: number(params[filterKeys.thicknessMin]),
    thicknessMax: number(params[filterKeys.thicknessMax]),
    priceMin: number(params[filterKeys.priceMin]),
    priceMax: number(params[filterKeys.priceMax]),
    sampleAvailable: params[filterKeys.sample] === "1" ? true : undefined,
    search: search?.trim() || undefined,
    sort,
    page,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };
}

/** Number of facet selections currently applied (drives the mobile badge). */
export function countActiveFilters(state: CatalogSearchState) {
  const arrays = [
    state.categories,
    state.collections,
    state.tones,
    state.materials,
    state.styles,
    state.colors,
    state.brands,
    state.sizes,
    state.surfaces,
    state.water,
    state.usage,
    state.availability,
  ];
  const fromArrays = arrays.reduce((sum, values) => sum + (values?.length ?? 0), 0);
  const ranges = [
    state.thicknessMin,
    state.thicknessMax,
    state.priceMin,
    state.priceMax,
  ].filter((value) => value !== undefined).length;
  return fromArrays + ranges + (state.sampleAvailable ? 1 : 0);
}

export function buildQueryString(
  current: URLSearchParams,
  changes: Record<string, string | string[] | null>,
) {
  const next = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || (Array.isArray(value) && value.length === 0)) {
      next.delete(key);
      continue;
    }
    next.set(key, Array.isArray(value) ? value.join(",") : value);
  }
  // Any filter change resets pagination.
  if (!("page" in changes)) next.delete(filterKeys.page);
  const query = next.toString();
  return query ? `?${query}` : "";
}
