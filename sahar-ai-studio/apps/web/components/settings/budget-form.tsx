'use client';

import { useActionState } from 'react';
import { FormError } from '@/components/auth/form-message';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Dictionary } from '@/lib/i18n/config';
import { setBudgetAction, type BudgetFormState } from '@/lib/settings-actions';

export function BudgetForm({
  current,
  labels,
  common,
}: {
  current: string | null;
  labels: Dictionary['settings']['budget'];
  common: Dictionary['common'];
}) {
  const [state, action, pending] = useActionState<BudgetFormState, FormData>(setBudgetAction, {});

  return (
    <form action={action} className="flex flex-col gap-3" data-testid="budget-form">
      <Label htmlFor="monthlyBudgetUsd">{labels.label}</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="monthlyBudgetUsd"
          name="monthlyBudgetUsd"
          inputMode="decimal"
          dir="ltr"
          placeholder={labels.placeholder}
          defaultValue={current ?? ''}
          className="sm:max-w-48"
        />
        <Button type="submit" disabled={pending}>
          {pending ? common.saving : common.save}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{labels.clearHint}</p>
      <FormError message={state.error} />
      {state.ok ? (
        <p role="status" className="text-sm text-success">
          {labels.updated}
        </p>
      ) : null}
    </form>
  );
}
