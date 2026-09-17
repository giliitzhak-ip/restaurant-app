'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Field, inputClasses } from '@/components/ui';
import { apiFetch, ApiRequestError } from '@/lib/client/api';

type Mode = 'login' | 'register';

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
                  ? 'bg-accent-500 text-navy-950'
                  : 'bg-navy-800 text-slate-300 hover:text-white'
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

          <Field
            label="סיסמה"
            htmlFor="password"
            error={fieldErrors.password}
            hint={mode === 'register' ? 'לפחות 8 תווים' : undefined}
          >
            <input
              id="password"
              type="password"
              dir="ltr"
              className={inputClasses}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 8 : 1}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            />
          </Field>

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
                        ? 'border-accent-500 bg-accent-500/10 text-white'
                        : 'border-navy-600 bg-navy-950 text-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {error && (
            <p role="alert" className="rounded-xl bg-danger-500/10 px-4 py-3 text-sm text-danger-400">
              {error}
            </p>
          )}

          <Button type="submit" fullWidth loading={busy}>
            {mode === 'login' ? 'התחברו' : 'צרו חשבון'}
          </Button>
        </form>
      </Card>

      {demoMode && (
        <Card className="border-warning-500/30 bg-warning-500/5">
          <p className="text-sm font-semibold text-warning-400">מצב הדגמה</p>
          <p className="mt-1 text-sm text-slate-400">
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
