/**
 * Money is always handled as an integer number of agorot (ILS minor units).
 * Floating point never touches a monetary value.
 */
export const VAT_RATE_BP = 1700 // 17% expressed in basis points, configurable via settings

export function formatAgorot(value: number | null | undefined, currency = 'ILS'): string {
  if (value === null || value === undefined) return 'ממתין לעדכון'
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency,
    minimumFractionDigits: value % 100 === 0 ? 0 : 2,
  }).format(value / 100)
}

export function shekelsToAgorot(value: number): number {
  return Math.round(value * 100)
}

export function agorotToShekels(value: number): number {
  return value / 100
}

/** VAT contained inside a VAT-inclusive total. */
export function vatFromGross(grossAgorot: number, rateBp: number = VAT_RATE_BP): number {
  return Math.round((grossAgorot * rateBp) / (10_000 + rateBp))
}

export function applyPercentage(amount: number, percent: number): number {
  return Math.round((amount * percent) / 100)
}

export interface MarginResult {
  grossProfit: number | null
  grossMarginPercent: number | null
}

/**
 * Internal profitability figures for the admin. Never exposed to storefront.
 */
export function calculateMargin(
  sellingPrice: number | null | undefined,
  costPrice: number | null | undefined,
): MarginResult {
  if (sellingPrice === null || sellingPrice === undefined) return { grossProfit: null, grossMarginPercent: null }
  if (costPrice === null || costPrice === undefined) return { grossProfit: null, grossMarginPercent: null }
  const grossProfit = sellingPrice - costPrice
  if (sellingPrice === 0) return { grossProfit, grossMarginPercent: null }
  return {
    grossProfit,
    grossMarginPercent: Math.round((grossProfit / sellingPrice) * 1000) / 10,
  }
}

/** The price a customer actually pays: sale price when set and lower. */
export function effectivePrice(price: number | null, salePrice: number | null): number | null {
  if (salePrice !== null && salePrice !== undefined && price !== null && salePrice < price) return salePrice
  return price ?? null
}

export function discountPercent(price: number | null, salePrice: number | null): number | null {
  if (!price || !salePrice || salePrice >= price) return null
  return Math.round(((price - salePrice) / price) * 100)
}
