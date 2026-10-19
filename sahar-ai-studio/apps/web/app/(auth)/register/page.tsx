import { PASSWORD_MIN_LENGTH } from '@sahar/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { RegisterForm } from '@/components/auth/register-form';
import { FormError } from '@/components/auth/form-message';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { getServerEnv } from '@/lib/env';
import { getI18n } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.auth.registerTitle };
}

export default async function RegisterPage() {
  const { t } = await getI18n();
  const open = getServerEnv().ALLOW_REGISTRATION;

  return (
    <Card>
      <CardHeader>
        <h1 className="text-xl leading-tight font-semibold">{t.auth.registerTitle}</h1>
        <CardDescription>{t.auth.registerSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        {open ? (
          <RegisterForm t={t.auth} passwordMin={PASSWORD_MIN_LENGTH} />
        ) : (
          <div className="flex flex-col gap-4">
            <FormError message={t.auth.errors.registrationDisabled} />
            <Link
              href="/login"
              className="text-center text-sm font-medium text-gold-300 hover:underline"
            >
              {t.auth.goLogin}
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
