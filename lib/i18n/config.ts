export const LOCALES = ['he', 'en', 'ar', 'ru'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'he';
export const LOCALE_COOKIE = 'gs_locale';

export const RTL_LOCALES: Locale[] = ['he', 'ar'];

export const LOCALE_LABELS: Record<Locale, string> = {
  he: 'עברית',
  en: 'English',
  ar: 'العربية',
  ru: 'Русский',
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export function directionOf(locale: Locale): 'rtl' | 'ltr' {
  return RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
}
