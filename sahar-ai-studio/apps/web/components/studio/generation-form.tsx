'use client';

import { FlaskConical } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { FormError } from '@/components/auth/form-message';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requestGenerationAction } from '@/lib/generation-actions';
import { format, isolateLtr, type Dictionary } from '@/lib/i18n/config';
import { cn } from '@/lib/utils';
import { uuidV4 } from '@/lib/uuid';

export interface ProviderOption {
  key: string;
  name: string;
  description: string;
  available: boolean;
  isTest: boolean;
  estimate: { amountUsd: string; billable: boolean; units: number; basis: string } | null;
  problem: string | null;
}

/**
 * Engine choice → cost estimate → explicit approval → queue. The approved amount is sent
 * with the request and re-checked on the server; each approval has its own idempotency key.
 */
export function GenerationForm({
  sceneId,
  providers,
  resolution,
  budgetLine,
  t,
}: {
  sceneId: string;
  providers: ProviderOption[];
  resolution: string;
  budgetLine: string;
  t: Dictionary['studio'];
}) {
  const router = useRouter();
  const firstAvailable = providers.find((p) => p.available)?.key ?? '';
  const [providerKey, setProviderKey] = useState(firstAvailable);
  const [approved, setApproved] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(uuidV4);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [pending, startTransition] = useTransition();
  const selected = providers.find((p) => p.key === providerKey);
  const amount = selected?.estimate ? `$${selected.estimate.amountUsd}` : null;

  function submit() {
    setError(undefined);
    setNotice(undefined);
    if (!selected?.estimate) return setError(selected?.problem ?? t.errors.notOperational);
    if (!approved) return setError(t.errors.approvalRequired);
    startTransition(async () => {
      const result = await requestGenerationAction({
        sceneId,
        providerKey,
        approvedAmountUsd: selected.estimate!.amountUsd,
        approved: true,
        idempotencyKey,
      });
      if (result.ok) {
        setNotice(t.queued);
        setApproved(false);
        setIdempotencyKey(uuidV4());
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-5" data-testid="generation-form">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t.providerTitle}</legend>
        {providers.map((provider) => (
          <label
            key={provider.key}
            className={cn(
              'flex items-start gap-3 rounded-lg border p-3',
              provider.available
                ? 'cursor-pointer border-input has-[:checked]:border-gold-400 has-[:checked]:bg-accent'
                : 'cursor-not-allowed border-border opacity-60',
            )}
            data-testid={`provider-${provider.key}`}
          >
            <input
              type="radio"
              name="provider"
              value={provider.key}
              checked={providerKey === provider.key}
              disabled={!provider.available}
              onChange={() => {
                setProviderKey(provider.key);
                setApproved(false);
              }}
              className="mt-1 accent-[var(--color-gold-400)]"
            />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {provider.name}
                {provider.isTest ? (
                  <Badge variant="muted">
                    <FlaskConical className="size-3" aria-hidden />
                    {t.testBadge}
                  </Badge>
                ) : null}
                {!provider.available ? <Badge variant="muted">{t.unavailable}</Badge> : null}
              </span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {provider.description}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {selected ? (
        <section
          className="rounded-lg border border-gold-500/30 bg-accent/50 p-4"
          data-testid="cost-estimate"
          aria-live="polite"
        >
          <h3 className="text-sm font-semibold">{t.estimate.title}</h3>
          {selected.estimate ? (
            <>
              <p className="mt-2 flex flex-wrap items-baseline gap-3">
                <bdi className="text-3xl font-semibold text-gold-200" data-testid="estimate-amount">
                  ${selected.estimate.amountUsd}
                </bdi>
                <Badge variant={selected.estimate.billable ? 'default' : 'success'}>
                  {selected.estimate.billable ? t.estimate.billable : t.estimate.notBillable}
                </Badge>
              </p>
              <ul className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
                <li>
                  {t.estimate.basis[selected.estimate.basis as keyof typeof t.estimate.basis] ??
                    selected.estimate.basis}
                </li>
                <li>
                  {format(t.estimate.duration, {
                    seconds: isolateLtr(selected.estimate.units.toFixed(1)),
                  })}
                </li>
                <li>{format(t.estimate.resolution, { size: isolateLtr(resolution) })}</li>
                <li>{budgetLine}</li>
              </ul>
            </>
          ) : (
            <p className="mt-2 text-sm text-destructive">{selected.problem}</p>
          )}
        </section>
      ) : null}

      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-surface p-3 text-sm leading-relaxed text-muted-foreground">
        <input
          type="checkbox"
          checked={approved}
          onChange={(event) => setApproved(event.target.checked)}
          disabled={!selected?.estimate || pending}
          className="mt-1 size-5 shrink-0 accent-[var(--color-gold-400)]"
          data-testid="approve-estimate"
        />
        <span>{format(t.approve, { amount: isolateLtr(amount ?? '—') })}</span>
      </label>

      <FormError message={error} />
      {notice ? (
        <p role="status" className="text-sm text-success">
          {notice}
        </p>
      ) : null}
      <div>
        <Button
          size="lg"
          onClick={submit}
          disabled={pending || !selected?.estimate}
          data-testid="generate"
        >
          {pending ? t.submitting : t.generate}
        </Button>
      </div>
    </div>
  );
}
