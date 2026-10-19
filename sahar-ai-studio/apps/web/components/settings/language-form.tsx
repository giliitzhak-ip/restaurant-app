import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LOCALES, type AppLocale, type Dictionary } from '@/lib/i18n/config';
import { setLocaleAction } from '@/lib/settings-actions';

export function LanguageForm({
  locale,
  labels,
}: {
  locale: AppLocale;
  labels: Dictionary['settings']['language'];
}) {
  return (
    <form action={setLocaleAction} className="flex flex-wrap gap-2" data-testid="language-form">
      {LOCALES.map((option) => {
        const active = option === locale;
        return (
          <Button
            key={option}
            type="submit"
            name="locale"
            value={option}
            lang={option}
            variant={active ? 'default' : 'outline'}
            aria-pressed={active}
            data-testid={`language-${option}`}
          >
            {active ? <Check aria-hidden /> : null}
            {labels[option]}
          </Button>
        );
      })}
    </form>
  );
}
