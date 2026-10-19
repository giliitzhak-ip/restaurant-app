import { Activity, Database, HardDrive, Server } from 'lucide-react';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/session';
import { checkHealth } from '@/lib/health';
import { format } from '@/lib/i18n/config';
import { getI18n } from '@/lib/i18n/server';
import { getDashboardStats } from '@/lib/stats';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.dashboard.title };
}

export default async function DashboardPage() {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const [stats, health] = await Promise.all([getDashboardStats(user.id), checkHealth()]);
  const numberFormat = new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-US');
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

  const statCards = [
    {
      label: t.dashboard.stats.projects,
      value: numberFormat.format(stats.projects),
      testId: 'stat-projects',
    },
    {
      label: t.dashboard.stats.characters,
      value: numberFormat.format(stats.characters),
      testId: 'stat-characters',
    },
    {
      label: t.dashboard.stats.generationsThisMonth,
      value: numberFormat.format(stats.generationsThisMonth),
      testId: 'stat-generations',
    },
    {
      label: t.dashboard.stats.spendThisMonth,
      value: usd.format(stats.spendThisMonthUsd),
      testId: 'stat-spend',
    },
  ];

  const services = [
    {
      key: 'database',
      icon: Database,
      label: t.dashboard.services.database,
      ok: health.database,
      okText: t.dashboard.status.ok,
      badText: t.dashboard.status.down,
    },
    {
      key: 'redis',
      icon: Activity,
      label: t.dashboard.services.redis,
      ok: health.redis,
      okText: t.dashboard.status.ok,
      badText: t.dashboard.status.down,
    },
    {
      key: 'worker',
      icon: Server,
      label: t.dashboard.services.worker,
      ok: health.worker,
      okText: t.dashboard.status.ok,
      badText: t.dashboard.status.down,
      hint: health.worker ? undefined : t.dashboard.workerHint,
    },
    {
      key: 'storage',
      icon: HardDrive,
      label: t.dashboard.services.storage,
      ok: health.storageConfigured,
      okText: t.dashboard.status.configured,
      badText: t.dashboard.status.notConfigured,
    },
  ];

  return (
    <>
      <PageHeader
        title={format(t.dashboard.greeting, { name: user.name })}
        description={t.dashboard.subtitle}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.testId} className="p-4 sm:p-5">
            <p className="text-xs text-muted-foreground sm:text-sm">{card.label}</p>
            <p
              className="mt-2 text-2xl font-semibold text-gold-200 sm:text-3xl"
              data-testid={card.testId}
            >
              <bdi>{card.value}</bdi>
            </p>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{t.dashboard.systemStatus}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {services.map(({ key, icon: Icon, label, ok, okText, badText, hint }) => (
                <li
                  key={key}
                  className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0"
                  data-testid={`health-${key}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-3 text-sm">
                      <Icon className="size-4 text-muted-foreground" aria-hidden />
                      {label}
                    </span>
                    <Badge variant={ok ? 'success' : 'danger'} data-state={ok ? 'ok' : 'down'}>
                      <span
                        aria-hidden
                        className={`size-1.5 rounded-full ${ok ? 'bg-success' : 'bg-destructive'}`}
                      />
                      {ok ? okText : badText}
                    </Badge>
                  </div>
                  {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t.dashboard.roadmapTitle}</CardTitle>
            <CardDescription className="leading-relaxed">{t.dashboard.roadmapBody}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </>
  );
}
