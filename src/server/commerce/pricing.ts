import { commerce } from "@/config/brand";
import { roundTo } from "@/lib/format";
import type { Coupon, Product } from "@/types/catalog";
import type {
  Cart,
  CartItem,
  CartTotals,
  FulfilmentMethod,
} from "@/types/commerce";

/** Driver-agnostic persisted cart. Prices are always recomputed from the catalogue. */
export interface CartRecord {
  id: string;
  userId: string | null;
  couponCode: string | null;
  installation: boolean;
  installationSqm: number;
  fulfilment: FulfilmentMethod;
  items: CartItemRecord[];
  updatedAt: string;
}

export interface CartItemRecord {
  id: string;
  productId: string;
  units: number;
  requestedSqm: number | null;
  /** Sample pieces are charged at the flat sample fee, not by coverage. */
  sample: boolean;
  designId: string | null;
  designLabel: string | null;
}

export function emptyCartRecord(id: string, userId: string | null = null): CartRecord {
  return {
    id,
    userId,
    couponCode: null,
    installation: false,
    installationSqm: 0,
    fulfilment: "SHIPPING",
    items: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Packages are sold whole: a customer asking for 12.8 m² of a 2.23 m² box
 * needs 6 boxes. This is the single place that rounding happens, so the
 * calculator, the cart and the designer can never disagree.
 */
export function unitsForArea(product: Product, sqm: number) {
  if (!product.packageCoverageSqm || product.packageCoverageSqm <= 0) {
    return Math.max(1, Math.ceil(sqm));
  }
  return Math.max(1, Math.ceil(roundTo(sqm / product.packageCoverageSqm, 4)));
}

export function coveredSqmFor(product: Product, units: number) {
  if (!product.packageCoverageSqm) return null;
  return roundTo(units * product.packageCoverageSqm, 2);
}

export function discountFor(
  subtotal: number,
  coupon: Coupon | null | undefined,
): { amount: number; code: string | null } {
  if (!coupon || !coupon.active) return { amount: 0, code: null };
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
    return { amount: 0, code: null };
  }
  if (coupon.minSubtotal && subtotal < coupon.minSubtotal) {
    return { amount: 0, code: null };
  }
  const amount =
    coupon.kind === "PERCENT"
      ? roundTo((subtotal * coupon.value) / 100, 2)
      : Math.min(coupon.value, subtotal);
  return { amount, code: coupon.code };
}

export function computeTotals(input: {
  items: CartItem[];
  fulfilment: FulfilmentMethod;
  installation: boolean;
  installationSqm: number;
  coupon: Coupon | null;
}): CartTotals {
  const subtotal = roundTo(
    input.items.reduce((sum, item) => sum + item.lineTotal, 0),
    2,
  );
  const totalSqm = roundTo(
    input.items.reduce((sum, item) => sum + (item.coveredSqm ?? 0), 0),
    2,
  );
  const { amount: discount } = discountFor(subtotal, input.coupon);
  const afterDiscount = subtotal - discount;

  const installationArea = input.installationSqm > 0 ? input.installationSqm : totalSqm;
  const installation =
    input.installation && commerce.installationPricePerSqm
      ? roundTo(installationArea * commerce.installationPricePerSqm, 2)
      : 0;

  const shipping =
    input.fulfilment === "PICKUP" || subtotal === 0
      ? 0
      : afterDiscount >= commerce.freeShippingThreshold
        ? 0
        : commerce.shippingFlatRate;

  return {
    subtotal,
    discount,
    shipping,
    installation,
    total: roundTo(afterDiscount + shipping + installation, 2),
    totalSqm,
    itemCount: input.items.reduce((sum, item) => sum + item.units, 0),
    freeShippingRemaining:
      input.fulfilment === "PICKUP"
        ? 0
        : Math.max(0, roundTo(commerce.freeShippingThreshold - afterDiscount, 2)),
  };
}

/** Joins a stored cart with live catalogue data and recalculates every total. */
export function hydrateCart(
  record: CartRecord,
  products: Map<string, Product>,
  coupon: Coupon | null,
): Cart {
  const items: CartItem[] = [];

  for (const line of record.items) {
    const product = products.get(line.productId);
    // A product that was removed from the catalogue silently drops out of the
    // cart rather than breaking checkout.
    if (!product || !product.active) continue;
    const units = Math.max(1, Math.round(line.units));
    const unitPrice = line.sample ? commerce.samplePrice : product.pricePerUnit;
    items.push({
      id: line.id,
      productId: product.id,
      productSlug: product.slug,
      name: line.sample ? `${product.name} — דוגמה` : product.name,
      subtitle: product.subtitle,
      imageUrl: product.images[0]?.url ?? "",
      units,
      unitPrice,
      pricingUnit: line.sample ? "ITEM" : product.pricingUnit,
      packageCoverageSqm: line.sample ? null : product.packageCoverageSqm,
      requestedSqm: line.sample ? null : line.requestedSqm,
      coveredSqm: line.sample ? null : coveredSqmFor(product, units),
      lineTotal: roundTo(units * unitPrice, 2),
      sample: line.sample,
      designId: line.designId,
      designLabel: line.designLabel,
    });
  }

  return {
    id: record.id,
    items,
    couponCode: record.couponCode,
    installation: record.installation,
    installationSqm: record.installationSqm,
    fulfilment: record.fulfilment,
    totals: computeTotals({
      items,
      fulfilment: record.fulfilment,
      installation: record.installation,
      installationSqm: record.installationSqm,
      coupon,
    }),
    updatedAt: record.updatedAt,
  };
}

/** TN-2609-4821 — human readable, unique enough for a showroom. */
export function generateOrderNumber(now = new Date()) {
  const stamp = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const random = Math.floor(1000 + Math.random() * 9000);
  return `TN-${stamp}-${random}`;
}

export function generateQuoteNumber(now = new Date()) {
  const stamp = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const random = Math.floor(1000 + Math.random() * 9000);
  return `QT-${stamp}-${random}`;
}
