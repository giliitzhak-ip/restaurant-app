import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/login-form';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { safeRedirectPath } from '@/lib/auth/validation';
import { getI18n } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.auth.loginTitle };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { t } = await getI18n();
  const { next } = await searchParams;
  const nextPath = typeof next === 'string' ? safeRedirectPath(next) : undefined;

  return (
    <Card>
      <CardHeader>
        <h1 className="text-xl leading-tight font-semibold">{t.auth.loginTitle}</h1>
        <CardDescription>{t.auth.loginSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm t={t.auth} next={nextPath === '/' ? undefined : nextPath} />
      </CardContent>
    </Card>
  );
}
