'use client';

import { useActionState } from 'react';
import { FormError } from '@/components/auth/form-message';
import { ConfirmSubmit } from '@/components/confirm-submit';
import type { ActionState } from '@/lib/character-actions';

export function DeleteCharacter({
  action,
  label,
  confirm,
}: {
  action: (prev: ActionState) => Promise<ActionState>;
  label: string;
  confirm: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <FormError message={state.error} />
      <div>
        <ConfirmSubmit
          variant="outline"
          message={confirm}
          disabled={pending}
          className="text-destructive"
          data-testid="delete-character"
        >
          {label}
        </ConfirmSubmit>
      </div>
    </form>
  );
}
