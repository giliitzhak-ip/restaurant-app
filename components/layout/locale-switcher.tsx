'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Languages } from 'lucide-react';
import { LOCALES, LOCALE_COOKIE, LOCALE_LABELS, type Locale } from '@/lib/i18n/config';
import { useI18n } from '@/components/providers/i18n-provider';

/**
 * Locale is stored in a cookie and read by the root layout, which sets `lang`
 * and `dir` — so switching to Arabic keeps RTL and switching to English flips
 * the whole document to LTR without a client-side re-layout hack.
 */
export function LocaleSwitcher() {
  const { locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">בחירת שפה</span>
      <Languages className="pointer-events-none absolute size-4 text-muted-foreground start-2" aria-hidden />
      <select
        value={locale}
        disabled={pending}
        onChange={(event) => change(event.target.value as Locale)}
        className="h-9 appearance-none rounded-lg border-0 bg-transparent ps-7 pe-2 text-sm font-medium hover:bg-secondary"
      >
        {LOCALES.map((option) => (
          <option key={option} value={option}>
            {LOCALE_LABELS[option]}
          </option>
        ))}
      </select>
    </label>
  );
}
