import { he } from "./dictionaries/he";

export const locales = ["he", "en", "ar", "ru"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "he";

/** Locales that are actually shipped today. */
export const activeLocales: Locale[] = ["he"];

export const localeMeta: Record<
  Locale,
  { label: string; dir: "rtl" | "ltr"; htmlLang: string }
> = {
  he: { label: "עברית", dir: "rtl", htmlLang: "he-IL" },
  en: { label: "English", dir: "ltr", htmlLang: "en" },
  ar: { label: "العربية", dir: "rtl", htmlLang: "ar" },
  ru: { label: "Русский", dir: "ltr", htmlLang: "ru" },
};

export type Dictionary = typeof he;

/**
 * Registry of shipped dictionaries. Adding English is: create
 * `dictionaries/en.ts` with `satisfies Dictionary`, register it here, add "en"
 * to `activeLocales`, and add the `[locale]` segment in the app router.
 * No component changes required.
 */
const dictionaries: Partial<Record<Locale, Dictionary>> = { he };

export function getDictionary(locale: Locale = defaultLocale): Dictionary {
  return dictionaries[locale] ?? he;
}

export function localeDir(locale: Locale = defaultLocale) {
  return localeMeta[locale].dir;
}

/**
 * The dictionary for the currently shipped default locale.
 *
 * Components import `t` and read fully-typed keys (`t.nav.catalog`), so a
 * missing or renamed key is a compile error rather than a blank string.
 * When a second locale ships, this export is swapped for a context read and
 * the call sites stay identical.
 */
export const t: Dictionary = getDictionary(defaultLocale);
