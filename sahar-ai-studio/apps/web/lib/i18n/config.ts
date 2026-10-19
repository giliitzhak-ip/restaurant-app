import { en } from './dictionaries/en';
import { he, type Dictionary } from './dictionaries/he';

export const LOCALES = ['he', 'en'] as const;
export type AppLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = 'he';
export const LOCALE_COOKIE = 'sahar_locale';

const dictionaries: Record<AppLocale, Dictionary> = { he, en };

export function isLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function getDictionary(locale: AppLocale): Dictionary {
  return dictionaries[locale];
}

export function getDirection(locale: AppLocale): 'rtl' | 'ltr' {
  return locale === 'he' ? 'rtl' : 'ltr';
}

/** Replaces {placeholders}. Unknown placeholders are left intact so mistakes are visible. */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export type { Dictionary };
