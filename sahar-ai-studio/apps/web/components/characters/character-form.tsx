'use client';

import { useActionState } from 'react';
import { FormError } from '@/components/auth/form-message';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ActionState } from '@/lib/character-actions';
import type { Dictionary } from '@/lib/i18n/config';

export function CharacterForm({
  action,
  t,
  common,
  initial,
  submitLabel,
  savedLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  t: Dictionary['characters'];
  common: Dictionary['common'];
  initial?: { name: string; description: string; defaultAppearance: string };
  submitLabel: string;
  savedLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-4" data-testid="character-form">
      <FormError message={state.error} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">{t.create.name}</Label>
        <Input id="name" name="name" required maxLength={100} defaultValue={initial?.name} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">{t.create.description}</Label>
        <Textarea
          id="description"
          name="description"
          maxLength={1000}
          defaultValue={initial?.description}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="defaultAppearance">{t.create.appearance}</Label>
        <Textarea
          id="defaultAppearance"
          name="defaultAppearance"
          dir="ltr"
          maxLength={2000}
          defaultValue={initial?.defaultAppearance}
        />
        <p className="text-xs text-muted-foreground">{t.create.appearanceHint}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? common.saving : submitLabel}
        </Button>
        {state.ok && savedLabel ? (
          <span role="status" className="text-sm text-success">
            {savedLabel}
          </span>
        ) : null}
      </div>
    </form>
  );
}
