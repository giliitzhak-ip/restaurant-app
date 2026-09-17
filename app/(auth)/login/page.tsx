import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from '@/features/auth/components/login-form';
import { LoadingState } from '@/components/ui/states';
import { getServerDictionary } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'התחברות' };

export default async function LoginPage() {
  const { t } = await getServerDictionary();

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <h1 className="text-2xl font-bold">{t.auth.loginTitle}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t.auth.loginSubtitle}</p>
      <div className="mt-6">
        <Suspense fallback={<LoadingState />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
