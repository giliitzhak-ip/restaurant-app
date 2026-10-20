import { prisma } from '@sahar/db';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { BudgetForm } from '@/components/settings/budget-form';
import { LanguageForm } from '@/components/settings/language-form';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/session';
import { format } from '@/lib/i18n/config';
import { getI18n } from '@/lib/i18n/server';
import { getProviderStatus } from '@/lib/providers-status';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.settings.title };
}

export default async function SettingsPage() {
  const sessionUser = await requireUser();
  const { t, locale } = await getI18n();
  const s = t.settings;
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: sessionUser.id },
    select: { name: true, email: true, createdAt: true, monthlyBudgetUsd: true },
  });
  const providers = getProviderStatus();
  const dateFormat = new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-US', {
    dateStyle: 'long',
  });

  return (
    <>
      <PageHeader title={s.title} description={s.description} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{s.account.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
              <dt className="text-muted-foreground">{s.account.name}</dt>
              <dd className="font-medium">{user.name}</dd>
              <dt className="text-muted-foreground">{s.account.email}</dt>
              <dd className="font-medium break-all">
                <bdi>{user.email}</bdi>
              </dd>
              <dt className="text-muted-foreground">{s.account.memberSince}</dt>
              <dd className="font-medium">{dateFormat.format(user.createdAt)}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{s.language.title}</CardTitle>
            <CardDescription>{s.language.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <LanguageForm locale={locale} labels={s.language} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{s.budget.title}</CardTitle>
            <CardDescription>{s.budget.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <BudgetForm
              current={user.monthlyBudgetUsd ? user.monthlyBudgetUsd.toFixed(2) : null}
              labels={s.budget}
              common={t.common}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{s.providers.title}</CardTitle>
            <CardDescription>{s.providers.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border" data-testid="provider-status">
              {providers.map((provider) => (
                <li
                  key={provider.id}
                  className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{s.providers.names[provider.id]}</p>
                    {provider.envVar ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {s.providers.envVar}{' '}
                        <code dir="ltr" className="rounded bg-muted px-1.5 py-0.5 font-mono">
                          {provider.envVar}
                        </code>
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {provider.keyConfigured === null ? (
                      <Badge variant="muted">{s.providers.keyNotRequired}</Badge>
                    ) : (
                      <Badge
                        variant={provider.keyConfigured ? 'success' : 'muted'}
                        data-testid={`provider-key-${provider.id}`}
                      >
                        {provider.keyConfigured
                          ? s.providers.keyConfigured
                          : s.providers.keyMissing}
                      </Badge>
                    )}
                    {provider.operational ? (
                      <Badge variant="success" data-testid={`provider-operational-${provider.id}`}>
                        {s.providers.operational}
                      </Badge>
                    ) : (
                      <Badge>
                        {format(s.providers.integrationPlanned, { phase: provider.plannedPhase })}
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
