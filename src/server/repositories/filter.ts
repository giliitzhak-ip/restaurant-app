import type { Product } from "@/types/catalog";
import type { CatalogFacets, ProductQuery, ProductSort } from "./types";

/** Facet value for a plank/tile format: "190x1900" → 19 × 190 cm. */
export const sizeValue = (widthMm: number, lengthMm: number) =>
  `${widthMm}x${lengthMm}`;

export const sizeLabel = (value: string) => {
  const [w, l] = value.split("x").map(Number);
  if (!w || !l) return value;
  return `${w / 10} × ${l / 10} ס״מ`;
};

/** Price used for filtering and sorting: per m² when meaningful, else per unit. */
export const comparablePrice = (product: Product) =>
  product.pricePerSqm ?? product.pricePerUnit;

const matchesSurface = (product: Product, surfaces?: ("FLOOR" | "WALL")[]) => {
  if (!surfaces?.length) return true;
  return surfaces.some(
    (surface) =>
      product.specs.surface === surface || product.specs.surface === "BOTH",
  );
};

const normalise = (value: string) => value.trim().toLowerCase();

export function matchesFilter(product: Product, query: ProductQuery): boolean {
  if (!query.includeInactive && !product.active) return false;
  if (query.categories?.length && !query.categories.includes(product.categorySlug)) {
    return false;
  }
  if (
    query.collections?.length &&
    (!product.collectionSlug || !query.collections.includes(product.collectionSlug))
  ) {
    return false;
  }
  if (query.tones?.length && !query.tones.includes(product.specs.tone)) return false;
  if (query.materials?.length && !query.materials.includes(product.specs.material)) {
    return false;
  }
  if (
    query.styles?.length &&
    !product.specs.style.some((style) => query.styles!.includes(style))
  ) {
    return false;
  }
  if (query.colors?.length && !query.colors.includes(product.specs.colorName)) {
    return false;
  }
  if (query.brands?.length && !query.brands.includes(product.brand)) return false;
  if (
    query.sizes?.length &&
    !query.sizes.includes(sizeValue(product.specs.widthMm, product.specs.lengthMm))
  ) {
    return false;
  }
  if (!matchesSurface(product, query.surfaces)) return false;
  if (query.water?.length && !query.water.includes(product.specs.waterResistance)) {
    return false;
  }
  if (query.usage?.length) {
    const matches = query.usage.some(
      (usage) => product.specs.usage === usage || product.specs.usage === "BOTH",
    );
    if (!matches) return false;
  }
  if (query.availability?.length && !query.availability.includes(product.availability)) {
    return false;
  }
  if (
    query.thicknessMin !== undefined &&
    product.specs.thicknessMm < query.thicknessMin
  ) {
    return false;
  }
  if (
    query.thicknessMax !== undefined &&
    product.specs.thicknessMm > query.thicknessMax
  ) {
    return false;
  }
  const price = comparablePrice(product);
  if (query.priceMin !== undefined && price < query.priceMin) return false;
  if (query.priceMax !== undefined && price > query.priceMax) return false;
  if (query.featured !== undefined && product.featured !== query.featured) return false;
  if (query.isNew !== undefined && product.isNew !== query.isNew) return false;
  if (query.bestSeller !== undefined && product.bestSeller !== query.bestSeller) {
    return false;
  }
  if (query.hasTexture && !product.texture) return false;
  if (query.sampleAvailable && !product.sampleAvailable) return false;

  if (query.search) {
    const needle = normalise(query.search);
    const haystack = [
      product.name,
      product.subtitle,
      product.sku,
      product.brand,
      product.categoryName,
      product.collectionName ?? "",
      product.specs.colorName,
      product.specs.materialLabel,
      product.description,
    ]
      .map(normalise)
      .join(" ");
    if (!haystack.includes(needle)) return false;
  }

  return true;
}

export function sortProducts(products: Product[], sort: ProductSort = "popular") {
  const sorted = [...products];
  switch (sort) {
    case "new":
      sorted.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      break;
    case "price-asc":
      sorted.sort((a, b) => comparablePrice(a) - comparablePrice(b));
      break;
    case "price-desc":
      sorted.sort((a, b) => comparablePrice(b) - comparablePrice(a));
      break;
    case "popular":
    default:
      sorted.sort((a, b) => b.popularity - a.popularity);
      break;
  }
  return sorted;
}

function tally<T extends string>(values: T[]) {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

/** Builds the filter panel's options (and counts) from the active catalogue. */
export function buildFacets(products: Product[]): CatalogFacets {
  const active = products.filter((product) => product.active);

  const categories = new Map<string, { name: string; count: number }>();
  const collections = new Map<string, { name: string; count: number }>();
  const colors = new Map<string, { hex: string; count: number }>();

  for (const product of active) {
    const category = categories.get(product.categorySlug) ?? {
      name: product.categoryName,
      count: 0,
    };
    category.count += 1;
    categories.set(product.categorySlug, category);

    if (product.collectionSlug && product.collectionName) {
      const collection = collections.get(product.collectionSlug) ?? {
        name: product.collectionName,
        count: 0,
      };
      collection.count += 1;
      collections.set(product.collectionSlug, collection);
    }

    const color = colors.get(product.specs.colorName) ?? {
      hex: product.specs.colorHex,
      count: 0,
    };
    color.count += 1;
    colors.set(product.specs.colorName, color);
  }

  const thicknesses = active.map((product) => product.specs.thicknessMm);
  const prices = active.map(comparablePrice);

  return {
    categories: [...categories.entries()]
      .map(([slug, value]) => ({ slug, name: value.name, count: value.count }))
      .sort((a, b) => b.count - a.count),
    collections: [...collections.entries()]
      .map(([slug, value]) => ({ slug, name: value.name, count: value.count }))
      .sort((a, b) => b.count - a.count),
    tones: [...tally(active.map((p) => p.specs.tone)).entries()].map(([value, count]) => ({
      value,
      count,
    })),
    materials: [...tally(active.map((p) => p.specs.material)).entries()].map(
      ([value, count]) => ({ value, count }),
    ),
    styles: [...tally(active.flatMap((p) => p.specs.style)).entries()].map(
      ([value, count]) => ({ value, count }),
    ),
    colors: [...colors.entries()]
      .map(([value, data]) => ({ value, hex: data.hex, count: data.count }))
      .sort((a, b) => b.count - a.count),
    brands: [...tally(active.map((p) => p.brand)).entries()].map(([value, count]) => ({
      value,
      count,
    })),
    sizes: [
      ...tally(
        active.map((p) => sizeValue(p.specs.widthMm, p.specs.lengthMm)),
      ).entries(),
    ]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count),
    water: [...tally(active.map((p) => p.specs.waterResistance)).entries()].map(
      ([value, count]) => ({ value, count }),
    ),
    usage: [...tally(active.map((p) => p.specs.usage)).entries()].map(
      ([value, count]) => ({ value, count }),
    ),
    availability: [...tally(active.map((p) => p.availability)).entries()].map(
      ([value, count]) => ({ value, count }),
    ),
    thickness: {
      min: thicknesses.length ? Math.min(...thicknesses) : 0,
      max: thicknesses.length ? Math.max(...thicknesses) : 0,
    },
    price: {
      min: prices.length ? Math.floor(Math.min(...prices)) : 0,
      max: prices.length ? Math.ceil(Math.max(...prices)) : 0,
    },
  };
}
