import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SignupForm } from '@/features/auth/components/signup-form';
import { LoadingState } from '@/components/ui/states';
import { getServerDictionary } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'הרשמה' };

export default async function SignupPage() {
  const { t } = await getServerDictionary();

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <h1 className="text-2xl font-bold">{t.auth.signupTitle}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t.auth.signupSubtitle}</p>
      <div className="mt-6">
        <Suspense fallback={<LoadingState />}>
          <SignupForm />
        </Suspense>
      </div>
    </div>
  );
}
