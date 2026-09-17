'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { signInSchema } from '@/lib/validation/auth';
import { fieldErrorsOf } from '@/features/auth/lib/form';
import { useT } from '@/components/providers/i18n-provider';
import { DemoNotice } from './demo-notice';

export function LoginForm() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const supabase = getBrowserSupabase();
  if (!supabase) return <DemoNotice />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const form = new FormData(event.currentTarget);
    const parsed = signInSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    });

    if (!parsed.success) {
      setErrors(fieldErrorsOf(parsed.error));
      return;
    }

    setErrors({});
    setLoading(true);

    const { error } = await supabase!.auth.signInWithPassword(parsed.data);
    setLoading(false);

    if (error) {
      setFormError(t.auth.loginFailed);
      return;
    }

    // The server layout redirects to the right home for the user's role.
    router.replace(next && next.startsWith('/') ? next : '/app');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive">
          {formError}
        </p>
      ) : null}

      <Field label={t.auth.email} htmlFor="email" error={errors.email} required>
        <div className="relative">
          <Mail
            className="pointer-events-none absolute inset-y-0 my-auto size-4 text-muted-foreground start-3"
            aria-hidden
          />
          <Input
            id="email"
            name="email"
            type="email"
            dir="ltr"
            autoComplete="email"
            required
            className="ps-9"
            aria-invalid={Boolean(errors.email)}
            placeholder="you@example.com"
          />
        </div>
      </Field>

      <Field label={t.auth.password} htmlFor="password" error={errors.password} required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(errors.password)}
        />
      </Field>

      <Button type="submit" size="full" loading={loading}>
        {t.common.login}
      </Button>

      <div className="space-y-3 pt-2 text-center text-sm">
        <p>
          <Link href="/verify" className="inline-flex items-center gap-1 text-accent hover:underline">
            <Phone className="size-4" aria-hidden />
            {t.auth.byPhone}
          </Link>
        </p>
        <p className="text-muted-foreground">
          {t.auth.noAccount}{' '}
          <Link href="/signup" className="font-medium text-accent hover:underline">
            {t.common.signup}
          </Link>
        </p>
      </div>
    </form>
  );
}
