'use client';

import { X } from 'lucide-react';
import { useActionState, useEffect, useRef } from 'react';
import { FormError } from '@/components/auth/form-message';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { removePresetAction, type ActionState } from '@/lib/character-actions';
import type { Dictionary } from '@/lib/i18n/config';

export function PresetList({
  kind,
  items,
  addAction,
  t,
  testId,
}: {
  kind: 'clothing' | 'style';
  items: { id: string; name: string; description: string }[];
  addAction: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  t: Dictionary['characters']['presets'];
  testId: string;
}) {
  const [state, formAction, pending] = useActionState(addAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">{t.empty}</p> : null}
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-start justify-between gap-3 rounded-md border border-border bg-surface p-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{item.name}</p>
              <p className="text-xs text-muted-foreground" dir="ltr">
                {item.description}
              </p>
            </div>
            <form action={removePresetAction}>
              <input type="hidden" name="presetId" value={item.id} />
              <input type="hidden" name="kind" value={kind} />
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                aria-label={`${t.remove}: ${item.name}`}
              >
                <X />
              </Button>
            </form>
          </li>
        ))}
      </ul>
      <form ref={formRef} action={formAction} className="flex flex-col gap-2 sm:flex-row">
        <Input
          name="name"
          placeholder={t.name}
          aria-label={t.name}
          maxLength={100}
          required
          className="sm:w-40"
        />
        <Input
          name="description"
          placeholder={t.description}
          aria-label={t.description}
          dir="ltr"
          maxLength={300}
          required
        />
        <Button type="submit" variant="outline" disabled={pending}>
          {t.add}
        </Button>
      </form>
      <FormError message={state.error} />
    </div>
  );
}
