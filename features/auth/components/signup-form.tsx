'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Briefcase, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { signUpSchema } from '@/lib/validation/auth';
import { fieldErrorsOf } from '@/features/auth/lib/form';
import { useT } from '@/components/providers/i18n-provider';
import { DemoNotice } from './demo-notice';

type Role = 'customer' | 'provider';

export function SignupForm() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();

  const [role, setRole] = useState<Role>(params.get('role') === 'provider' ? 'provider' : 'customer');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const supabase = getBrowserSupabase();
  if (!supabase) return <DemoNotice />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setNotice(null);

    const form = new FormData(event.currentTarget);
    const phone = String(form.get('phone') ?? '').trim();

    const parsed = signUpSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
      fullName: form.get('fullName'),
      phone: phone || undefined,
      role,
      acceptTerms: form.get('acceptTerms') === 'on',
    });

    if (!parsed.success) {
      setErrors(fieldErrorsOf(parsed.error));
      return;
    }

    setErrors({});
    setLoading(true);

    // `role` travels in user metadata; the `handle_new_user` trigger reads it
    // and can only ever produce 'customer' or 'provider' — never 'admin'.
    const { data, error } = await supabase!.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { full_name: parsed.data.fullName, role: parsed.data.role, phone: parsed.data.phone },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (error) {
      setFormError(t.auth.signupFailed);
      return;
    }

    if (!data.session) {
      // Email confirmation is on: there is nothing to redirect to yet.
      setNotice(t.auth.checkEmail);
      return;
    }

    router.replace(parsed.data.role === 'provider' ? '/provider/onboarding' : '/app');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive">
          {formError}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-lg bg-success/10 p-3 text-sm font-medium text-success">
          {notice}
        </p>
      ) : null}

      <fieldset>
        <legend className="mb-2 block text-sm font-medium">{t.auth.accountType}</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { value: 'customer' as const, label: t.auth.iAmCustomer, icon: User },
              { value: 'provider' as const, label: t.auth.iAmProvider, icon: Briefcase },
            ]
          ).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={role === value}
              onClick={() => setRole(value)}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border p-4 text-center text-sm font-medium transition-colors',
                role === value ? 'border-accent bg-accent/5 text-accent' : 'hover:bg-secondary',
              )}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <Field label={t.auth.fullName} htmlFor="fullName" error={errors.fullName} required>
        <Input id="fullName" name="fullName" autoComplete="name" required aria-invalid={Boolean(errors.fullName)} />
      </Field>

      <Field label={t.auth.email} htmlFor="email" error={errors.email} required>
        <Input
          id="email"
          name="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          required
          aria-invalid={Boolean(errors.email)}
        />
      </Field>

      <Field label={t.auth.phone} htmlFor="phone" error={errors.phone} hint="לדוגמה 0501234567">
        <Input id="phone" name="phone" type="tel" dir="ltr" autoComplete="tel" aria-invalid={Boolean(errors.phone)} />
      </Field>

      <Field label={t.auth.password} htmlFor="password" error={errors.password} hint="לפחות 8 תווים" required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(errors.password)}
        />
      </Field>

      <div className="space-y-1">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="acceptTerms"
            className="mt-1 size-4 rounded border-input"
            aria-invalid={Boolean(errors.acceptTerms)}
          />
          <span>
            {t.auth.termsConsent} (
            <Link href="/legal/terms" className="text-accent hover:underline">
              {t.legal.terms}
            </Link>
            {', '}
            <Link href="/legal/privacy" className="text-accent hover:underline">
              {t.legal.privacy}
            </Link>
            )
          </span>
        </label>
        {errors.acceptTerms ? (
          <p role="alert" className="text-xs font-medium text-destructive">
            {errors.acceptTerms}
          </p>
        ) : null}
      </div>

      <Button type="submit" size="full" loading={loading}>
        {t.common.signup}
      </Button>

      <p className="pt-2 text-center text-sm text-muted-foreground">
        {t.auth.hasAccount}{' '}
        <Link href="/login" className="font-medium text-accent hover:underline">
          {t.common.login}
        </Link>
      </p>
    </form>
  );
}
