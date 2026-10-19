import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AppLocale, Dictionary } from '@/lib/i18n/config';
import { setLocaleAction } from '@/lib/settings-actions';

/** Single button that switches to the other language. Works without client JavaScript. */
export function LanguageToggle({
  locale,
  labels,
}: {
  locale: AppLocale;
  labels: Dictionary['settings']['language'];
}) {
  const target: AppLocale = locale === 'he' ? 'en' : 'he';
  return (
    <form action={setLocaleAction}>
      <input type="hidden" name="locale" value={target} />
      <Button type="submit" variant="ghost" size="sm" lang={target} data-testid="language-toggle">
        <Languages aria-hidden />
        {labels[target]}
      </Button>
    </form>
  );
}
