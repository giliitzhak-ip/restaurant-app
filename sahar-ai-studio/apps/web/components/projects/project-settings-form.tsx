'use client';

import { useActionState } from 'react';
import { FormError } from '@/components/auth/form-message';
import { Button } from '@/components/ui/button';
import type { Dictionary } from '@/lib/i18n/config';
import type { ProjectFormState } from '@/lib/project-actions';
import { ProjectFields, type CharacterChoice, type ProjectFieldValues } from './project-fields';

export function ProjectSettingsForm({
  action,
  t,
  common,
  characters,
  initial,
}: {
  action: (prev: ProjectFormState, formData: FormData) => Promise<ProjectFormState>;
  t: Dictionary['projects'];
  common: Dictionary['common'];
  characters: CharacterChoice[];
  initial: ProjectFieldValues;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-4" data-testid="project-settings">
      <ProjectFields t={t} characters={characters} initial={initial} />
      <FormError message={state.error} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? common.saving : common.save}
        </Button>
        {state.ok ? (
          <span role="status" className="text-sm text-success">
            {t.page.saved}
          </span>
        ) : null}
      </div>
    </form>
  );
}
