import { he, type Dictionary } from './dictionaries/he';
import { en } from './dictionaries/en';
import { ar } from './dictionaries/ar';
import { ru } from './dictionaries/ru';
import { DEFAULT_LOCALE, type Locale } from './config';
import type { DeepPartial } from './types';

const dictionaries: Record<Locale, DeepPartial<Dictionary>> = { he, en, ar, ru };

/** Merges a partial locale over Hebrew so every key always resolves. */
function mergeDeep<T>(base: T, override: DeepPartial<T> | undefined): T {
  if (!override) return base;
  const result = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    if (value === undefined) continue;
    const current = result[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && current && typeof current === 'object') {
      result[key] = mergeDeep(current, value as DeepPartial<typeof current>);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

const cache = new Map<Locale, Dictionary>();

export function getDictionary(locale: Locale = DEFAULT_LOCALE): Dictionary {
  const cached = cache.get(locale);
  if (cached) return cached;
  const merged = locale === 'he' ? he : mergeDeep(he, dictionaries[locale]);
  cache.set(locale, merged);
  return merged;
}

export type { Dictionary };
export { he };
