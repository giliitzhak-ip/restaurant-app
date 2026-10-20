'use client';

import { Users } from 'lucide-react';
import { useActionState } from 'react';
import { FormError } from '@/components/auth/form-message';
import { ConfirmSubmit } from '@/components/confirm-submit';
import type { SceneActionState } from '@/lib/scene-actions';

export function ApplyMainCharacter({
  action,
  label,
  done,
}: {
  action: (prev: SceneActionState) => Promise<SceneActionState>;
  label: string;
  done: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div>
        <ConfirmSubmit
          variant="outline"
          message={`${label}?`}
          disabled={pending}
          // Long label: wrap instead of overflowing the card on phones.
          className="h-auto min-h-11 py-2 text-start whitespace-normal"
          data-testid="apply-main"
        >
          <Users aria-hidden />
          {label}
        </ConfirmSubmit>
      </div>
      <FormError message={state.error} />
      {state.ok ? (
        <p role="status" className="text-sm text-success">
          {done}
        </p>
      ) : null}
    </form>
  );
}
