'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { requestOtpSchema, verifyOtpSchema } from '@/lib/validation/auth';
import { fieldErrorsOf } from '@/features/auth/lib/form';
import { useT } from '@/components/providers/i18n-provider';
import { DemoNotice } from './demo-notice';

/**
 * Phone + OTP sign-in.
 *
 * Supabase delivers the SMS through whichever provider is configured on the
 * project; with none configured the request fails and we say so plainly rather
 * than pretending a code was sent.
 */
export function OtpForm() {
  const t = useT();
  const router = useRouter();

  const [stage, setStage] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const supabase = getBrowserSupabase();
  if (!supabase) return <DemoNotice />;

  /** Supabase expects E.164; Israeli numbers are usually typed as 05X-XXXXXXX. */
  const toE164 = (value: string) =>
    value.startsWith('+') ? value : `+972${value.replace(/^0/, '')}`;

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = requestOtpSchema.safeParse({
      phone: String(new FormData(event.currentTarget).get('phone') ?? ''),
    });
    if (!parsed.success) {
      setErrors(fieldErrorsOf(parsed.error));
      return;
    }

    setErrors({});
    setLoading(true);
    const { error } = await supabase!.auth.signInWithOtp({
      phone: toE164(parsed.data.phone),
      options: { data: { role: parsed.data.role } },
    });
    setLoading(false);

    if (error) {
      setFormError('שליחת הקוד נכשלה. ודא שספק ה-SMS מוגדר בפרויקט Supabase.');
      return;
    }

    setPhone(parsed.data.phone);
    setStage('code');
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = verifyOtpSchema.safeParse({
      phone,
      token: String(new FormData(event.currentTarget).get('token') ?? ''),
    });
    if (!parsed.success) {
      setErrors(fieldErrorsOf(parsed.error));
      return;
    }

    setErrors({});
    setLoading(true);
    const { error } = await supabase!.auth.verifyOtp({
      phone: toE164(parsed.data.phone),
      token: parsed.data.token,
      type: 'sms',
    });
    setLoading(false);

    if (error) {
      setFormError('הקוד שגוי או פג תוקף.');
      return;
    }

    router.replace('/app');
    router.refresh();
  }

  if (stage === 'phone') {
    return (
      <form onSubmit={requestCode} noValidate className="space-y-4">
        {formError ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive">
            {formError}
          </p>
        ) : null}
        <Field label={t.auth.phone} htmlFor="phone" error={errors.phone} required>
          <Input id="phone" name="phone" type="tel" dir="ltr" autoComplete="tel" required />
        </Field>
        <Button type="submit" size="full" loading={loading}>
          {t.auth.sendCode}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={verifyCode} noValidate className="space-y-4">
      {formError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive">
          {formError}
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        {t.auth.otpSubtitle} <span className="num font-medium">{phone}</span>
      </p>
      <Field label={t.auth.otpCode} htmlFor="token" error={errors.token} required>
        <Input
          id="token"
          name="token"
          inputMode="numeric"
          dir="ltr"
          maxLength={6}
          autoComplete="one-time-code"
          required
          className="text-center text-2xl tracking-[0.5em]"
        />
      </Field>
      <Button type="submit" size="full" loading={loading}>
        {t.auth.verifyCode}
      </Button>
      <Button type="button" variant="ghost" size="full" onClick={() => setStage('phone')}>
        {t.common.back}
      </Button>
    </form>
  );
}
