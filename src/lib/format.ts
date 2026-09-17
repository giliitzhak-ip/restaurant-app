import { commerce } from "@/config/brand";

const priceFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: commerce.currency,
  maximumFractionDigits: 0,
});

const priceDecimalFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: commerce.currency,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("he-IL", {
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatPrice(value: number, opts?: { decimals?: boolean }) {
  return opts?.decimals
    ? priceDecimalFormatter.format(value)
    : priceFormatter.format(value);
}

export function formatNumber(value: number) {
  return numberFormatter.format(value);
}

/** 12.756 -> "12.76 מ״ר" */
export function formatArea(sqm: number) {
  return `${numberFormatter.format(roundTo(sqm, 2))} מ״ר`;
}

export function formatDate(value: Date | string) {
  return dateFormatter.format(new Date(value));
}

export function formatDateTime(value: Date | string) {
  return dateTimeFormatter.format(new Date(value));
}

export function roundTo(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** "1200x200" mm plank -> "120 × 20 ס״מ" */
export function formatDimensions(widthMm: number, lengthMm: number) {
  return `${widthMm / 10} × ${lengthMm / 10} ס״מ`;
}

export function formatThickness(mm: number) {
  return `${numberFormatter.format(mm)} מ״מ`;
}
