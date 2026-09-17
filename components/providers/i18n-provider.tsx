'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { DEFAULT_LOCALE, directionOf, type Locale } from '@/lib/i18n/config';
import { getDictionary, type Dictionary } from '@/lib/i18n';

interface I18nValue {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  t: Dictionary;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo<I18nValue>(
    () => ({ locale, dir: directionOf(locale), t: getDictionary(locale) }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Components read copy from here rather than embedding literals, so adding a
 * locale is a dictionary change and never a component change.
 */
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  // Rendering outside the provider (e.g. an isolated unit test) still works.
  return { locale: DEFAULT_LOCALE, dir: directionOf(DEFAULT_LOCALE), t: getDictionary(DEFAULT_LOCALE) };
}

export function useT(): Dictionary {
  return useI18n().t;
}
