import { Construction } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format, type Dictionary } from '@/lib/i18n/config';

/**
 * Honest status for modules that are not implemented yet: what will come and when.
 * Deliberately renders no action buttons.
 */
export function PhaseNotice({
  t,
  phase,
  features,
}: {
  t: Dictionary;
  phase: number;
  features: string[];
}) {
  return (
    <section
      data-testid="phase-notice"
      className="rounded-xl border border-dashed border-gold-500/35 bg-gradient-to-b from-accent/60 to-transparent p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-gold-400/10 text-gold-300">
          <Construction className="size-5" aria-hidden />
        </span>
        <h2 className="text-lg font-semibold">{t.phaseNotice.title}</h2>
        <Badge>{format(t.phaseNotice.comingIn, { phase })}</Badge>
      </div>
      <p className="mt-4 text-sm font-medium text-gold-200">{t.phaseNotice.plannedFeatures}</p>
      <ul className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
        {features.map((feature) => (
          <li key={feature} className="flex gap-2">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-gold-400/70" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-foreground/80">{t.phaseNotice.notAvailableYet}</p>
    </section>
  );
}
