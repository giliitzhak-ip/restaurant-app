'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginAction, type AuthFormState } from '@/lib/auth/actions';
import type { Dictionary } from '@/lib/i18n/config';
import { FormError } from './form-message';

export function LoginForm({ t, next }: { t: Dictionary['auth']; next?: string | undefined }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(loginAction, {});

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <FormError message={state.error} />
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
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t.password}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          required
        />
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t.loggingIn : t.loginButton}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {t.noAccount}{' '}
        <Link href="/register" className="font-medium text-gold-300 hover:underline">
          {t.goRegister}
        </Link>
      </p>
    </form>
  );
}
