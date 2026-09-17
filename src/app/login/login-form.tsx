'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Field, inputClasses } from '@/components/ui';
import { apiFetch, ApiRequestError } from '@/lib/client/api';

/**
 * `forgot` and `reset` are part of this form rather than a page of their own.
 *
 * There was no password reset at all, and the only recovery for a provider
 * who forgot theirs was an admin editing the database. Keeping it here means
 * one screen holds every way into an account, and somebody who mistyped their
 * password does not have to navigate anywhere to fix it.
 */
type Mode = 'login' | 'register' | 'forgot' | 'reset';

interface AuthResponse {
  id: string;
  role: 'customer' | 'provider' | 'admin';
  fullName: string | null;
}

export function LoginForm({ demoMode }: { demoMode: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'customer' | 'provider'>('customer');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  /** The code from the message, and what the last step said went well. */
  const [resetToken, setResetToken] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const routeFor = (user: AuthResponse, justRegistered = false): string => {
    if (next) return next;
    // A newly registered provider has no trade declared yet, so the console
    // would be a dead end. Send them straight to setup.
    if (user.role === 'provider') return justRegistered ? '/provider/onboarding' : '/provider';
    if (user.role === 'admin') return '/admin';
    return '/';
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);

    try {
      if (mode === 'forgot') {
        const result = await apiFetch<{ message: string }>('/api/auth/forgot', {
          method: 'POST',
          json: { email },
        });
        // The same message whether or not the account exists: the endpoint
        // will not say, and neither will this screen.
        setNotice(result.message);
        setMode('reset');
        return;
      }

      if (mode === 'reset') {
        const result = await apiFetch<{ message: string }>('/api/auth/reset', {
          method: 'POST',
          json: { token: resetToken.trim(), password },
        });
        setNotice(result.message);
        setResetToken('');
        setPassword('');
        // Deliberately back to login rather than straight in: holding the
        // code proves you can read the message, and a reset that mints a
        // session would make a leaked code as good as a stolen account.
        setMode('login');
        return;
      }

      const user =
        mode === 'login'
          ? await apiFetch<AuthResponse>('/api/auth/login', {
              method: 'POST',
              json: { email, password },
            })
          : await apiFetch<AuthResponse>('/api/auth/register', {
              method: 'POST',
              json: { email, password, fullName, role },
            });

      router.replace(routeFor(user, mode === 'register'));
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiRequestError) {
        if (caught.code === 'VALIDATION_FAILED' && Array.isArray(caught.details)) {
          const next: Record<string, string> = {};
          for (const issue of caught.details as { path: string[]; message: string }[]) {
            const key = issue.path?.[0];
            if (key) next[key] = issue.message;
          }
          setFieldErrors(next);
          setError('בדקו את הפרטים שהוזנו');
        } else {
          setError(caught.message);
        }
      } else {
        setError('משהו נכשל. נסו שוב.');
      }
    } finally {
      setBusy(false);
    }
  };

  const quickLogin = async (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('demo1234');
    setError(null);
    setBusy(true);
    try {
      const user = await apiFetch<AuthResponse>('/api/auth/login', {
        method: 'POST',
        json: { email: demoEmail, password: 'demo1234' },
      });
      router.replace(routeFor(user));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'ההתחברות נכשלה');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-5 flex gap-2" role="tablist">
          {(['login', 'register'] as const).map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={mode === value}
              onClick={() => {
                setMode(value);
                setError(null);
                setFieldErrors({});
              }}
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                mode === value
                  ? 'bg-brand text-bg'
                  : 'bg-surface-2 text-ink-2 hover:text-ink'
              }`}
            >
              {value === 'login' ? 'התחברות' : 'הרשמה'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' && (
            <Field label="שם מלא" htmlFor="fullName" error={fieldErrors.fullName}>
              <input
                id="fullName"
                className={inputClasses}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                minLength={2}
                autoComplete="name"
              />
            </Field>
          )}

          {mode !== 'reset' && (
          <Field label='דוא"ל' htmlFor="email" error={fieldErrors.email}>
            <input
              id="email"
              type="email"
              dir="ltr"
              className={inputClasses}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </Field>
          )}

          {mode !== 'forgot' && (
          <Field
            label={mode === 'reset' ? 'סיסמה חדשה' : 'סיסמה'}
            htmlFor="password"
            error={fieldErrors.password}
            hint={mode === 'register' || mode === 'reset' ? 'לפחות 8 תווים' : undefined}
          >
            <input
              id="password"
              type="password"
              dir="ltr"
              className={inputClasses}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' || mode === 'reset' ? 8 : 1}
              autoComplete={
                mode === 'register' || mode === 'reset' ? 'new-password' : 'current-password'
              }
            />
          </Field>
          )}

          {mode === 'register' && (
            <Field label="סוג החשבון">
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ['customer', 'אני מזמין שירות'],
                    ['provider', 'אני בעל מקצוע'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={role === value}
                    onClick={() => setRole(value)}
                    className={`min-h-12 rounded-xl border px-3 text-sm font-medium ${
                      role === value
                        ? 'border-brand bg-brand/10 text-ink'
                        : 'border-line-strong bg-bg text-ink-2'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {mode === 'reset' && (
            <Field
              label="הקוד מההודעה"
              htmlFor="reset-token"
              hint="הקוד בתוקף לחצי שעה"
            >
              <input
                id="reset-token"
                dir="ltr"
                autoComplete="one-time-code"
                className={inputClasses}
                value={resetToken}
                onChange={(event) => setResetToken(event.target.value)}
              />
            </Field>
          )}

          {notice && (
            <p className="rounded-xl bg-ok/10 px-4 py-3 text-sm text-ok-bright">{notice}</p>
          )}

          {error && (
            <p role="alert" className="rounded-xl bg-bad/10 px-4 py-3 text-sm text-bad-bright">
              {error}
            </p>
          )}

          <Button type="submit" fullWidth loading={busy}>
            {mode === 'login'
              ? 'התחברו'
              : mode === 'register'
                ? 'צרו חשבון'
                : mode === 'forgot'
                  ? 'שלחו לי קוד'
                  : 'עדכנו סיסמה'}
          </Button>

          {mode === 'login' && (
            <button
              type="button"
              onClick={() => {
                setMode('forgot');
                setError(null);
                setNotice(null);
              }}
              className="min-h-11 text-sm font-medium text-brand-bright underline decoration-line-strong underline-offset-4"
            >
              שכחתי את הסיסמה
            </button>
          )}

          {(mode === 'forgot' || mode === 'reset') && (
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setNotice(null);
              }}
              className="min-h-11 text-sm text-ink-2"
            >
              חזרה להתחברות
            </button>
          )}
        </form>
      </Card>

      {demoMode && (
        <Card className="border-warn/30 bg-warn/5">
          <p className="text-sm font-semibold text-warn-bright">מצב הדגמה</p>
          <p className="mt-1 text-sm text-ink-2">
            חשבונות לדוגמה בלבד. נתוני ההדגמה מסומנים ואינם מתערבבים בנתוני אמת.
          </p>
          <div className="mt-3 grid gap-2">
            <Button variant="secondary" size="md" onClick={() => quickLogin('rotem@demo.local')} disabled={busy}>
              כניסה כלקוח (רותם)
            </Button>
            <Button variant="secondary" size="md" onClick={() => quickLogin('ram-on-the-way@demo.local')} disabled={busy}>
              כניסה כבעל מקצוע (רם — כבר בדרך)
            </Button>
            <Button variant="secondary" size="md" onClick={() => quickLogin('admin@demo.local')} disabled={busy}>
              כניסה כמנהל
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
