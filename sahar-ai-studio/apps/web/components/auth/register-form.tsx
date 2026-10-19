'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { registerAction, type AuthFormState } from '@/lib/auth/actions';
import { format, type Dictionary } from '@/lib/i18n/config';
import { FieldError, FormError } from './form-message';

export function RegisterForm({ t, passwordMin }: { t: Dictionary['auth']; passwordMin: number }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(registerAction, {});
  const errors = state.fieldErrors ?? {};
  const invalid = (key: keyof typeof errors) =>
    errors[key] ? { 'aria-invalid': true as const, 'aria-describedby': `${key}-error` } : {};

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormError message={state.error} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">{t.name}</Label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          required
          maxLength={100}
          defaultValue={state.values?.name}
          {...invalid('name')}
        />
        <FieldError id="name-error" message={errors.name} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t.email}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state.values?.email}
          {...invalid('email')}
        />
        <FieldError id="email-error" message={errors.email} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t.password}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          required
          minLength={passwordMin}
          {...invalid('password')}
        />
        <p className="text-xs text-muted-foreground">
          {format(t.passwordHint, { min: passwordMin })}
        </p>
        <FieldError id="password-error" message={errors.password} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">{t.confirmPassword}</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          required
          {...invalid('confirmPassword')}
        />
        <FieldError id="confirmPassword-error" message={errors.confirmPassword} />
      </div>
      <div className="flex flex-col gap-2">
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-surface p-3 text-sm leading-relaxed text-muted-foreground">
          <input
            type="checkbox"
            name="acceptTerms"
            required
            className="mt-1 size-5 shrink-0 accent-[var(--color-gold-400)]"
            {...invalid('acceptTerms')}
          />
          <span>{t.acceptTerms}</span>
        </label>
        <FieldError id="acceptTerms-error" message={errors.acceptTerms} />
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t.registering : t.registerButton}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {t.haveAccount}{' '}
        <Link href="/login" className="font-medium text-gold-300 hover:underline">
          {t.goLogin}
        </Link>
      </p>
    </form>
  );
}
