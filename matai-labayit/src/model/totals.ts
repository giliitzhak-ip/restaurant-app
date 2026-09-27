import type { Design, Product } from './types';

/** סכום המחירים של המוצרים בגרסה (כל מוצר נספר פעם אחת). */
export const designTotal = (d: Pick<Design, 'layers'>, products: Record<string, Product>) => {
  const ids = new Set(d.layers.map((l) => l.productId).filter(Boolean) as string[]);
  let sum = 0;
  ids.forEach((id) => (sum += products[id]?.price ?? 0));
  return sum;
};

export const shekel = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;
