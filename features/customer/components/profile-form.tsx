'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { useT } from '@/components/providers/i18n-provider';
import { patchJson, fieldErrorsOf } from '@/features/auth/lib/form';
import { updateProfileSchema } from '@/lib/validation/auth';

interface Props {
  fullName: string;
  phone: string | null;
  defaultAddress: string | null;
}

export function ProfileForm({ fullName, phone, defaultAddress }: Props) {
  const t = useT();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const parsed = updateProfileSchema.safeParse({
      fullName: String(form.get('fullName') ?? ''),
      phone: String(form.get('phone') ?? '') || undefined,
      defaultAddress: String(form.get('defaultAddress') ?? '') || null,
    });

    if (!parsed.success) {
      setErrors(fieldErrorsOf(parsed.error));
      setStatus('error');
      return;
    }

    setErrors({});
    setStatus('saving');

    try {
      await patchJson('/api/me', parsed.data);
      setStatus('saved');
      setMessage(t.common.saved);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : t.errors.generic);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <Field label={t.auth.fullName} htmlFor="fullName" error={errors.fullName}>
        <Input id="fullName" name="fullName" defaultValue={fullName} autoComplete="name" />
      </Field>

      <Field label={t.auth.phone} htmlFor="phone" error={errors.phone}>
        <Input id="phone" name="phone" type="tel" dir="ltr" defaultValue={phone ?? ''} autoComplete="tel" />
      </Field>

      <Field
        label={t.wizard.addressLabel}
        htmlFor="defaultAddress"
        hint="הכתובת תופיע כברירת מחדל בבקשות חדשות"
      >
        <Input
          id="defaultAddress"
          name="defaultAddress"
          defaultValue={defaultAddress ?? ''}
          autoComplete="street-address"
        />
      </Field>

      {message ? (
        <p
          role="status"
          className={`rounded-lg p-3 text-sm font-medium ${
            status === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'
          }`}
        >
          {message}
        </p>
      ) : null}

      <Button type="submit" loading={status === 'saving'}>
        {t.common.save}
      </Button>
    </form>
  );
}
