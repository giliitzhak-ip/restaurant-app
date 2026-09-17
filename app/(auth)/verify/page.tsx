import type { Metadata } from 'next';
import { OtpForm } from '@/features/auth/components/otp-form';
import { getServerDictionary } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'אימות קוד' };

export default async function VerifyPage() {
  const { t } = await getServerDictionary();

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <h1 className="text-2xl font-bold">{t.auth.otpTitle}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t.auth.byPhone}</p>
      <div className="mt-6">
        <OtpForm />
      </div>
    </div>
  );
}
