import Link from 'next/link';
import type { Metadata } from 'next';
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  CreditCard,
  ShieldCheck,
  Star,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Price } from '@/components/ui/price';
import { requireAdmin, requireServiceClient } from '@/lib/api/guards';
import { getServerDictionary } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'סקירה' };
export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const { t } = await getServerDictionary();

  // The same guards the API uses — the page cannot render without them passing.
  await requireAdmin();
  const admin = requireServiceClient();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [users, providers, pending, jobsToday, completed, cancelled, totalJobs, disputes] =
    await Promise.all([
      admin.from('users').select('id', { count: 'exact', head: true }),
      admin.from('provider_profiles').select('id', { count: 'exact', head: true }).eq('status', 'verified'),
      admin.from('provider_profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      admin.from('jobs').select('id', { count: 'exact', head: true }).gte('created_at', startOfToday.toISOString()),
      admin.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
      admin.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'cancelled'),
      admin.from('jobs').select('id', { count: 'exact', head: true }),
      admin
        .from('disputes')
        .select('id', { count: 'exact', head: true })
        .in('status', ['open', 'under_review']),
    ]);

  const { data: captured } = await admin
    .from('payments')
    .select('amount, platform_fee')
    .eq('status', 'captured');

  const gmv = (captured ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const revenue = (captured ?? []).reduce((sum, row) => sum + Number(row.platform_fee), 0);

  const { data: ratings } = await admin
    .from('provider_profiles')
    .select('rating_avg, rating_count')
    .gt('rating_count', 0);

  const ratingTotal = (ratings ?? []).reduce((sum, row) => sum + row.rating_count, 0);
  const avgRating = ratingTotal
    ? (ratings ?? []).reduce((sum, row) => sum + Number(row.rating_avg) * row.rating_count, 0) / ratingTotal
    : 0;

  const jobCount = totalJobs.count ?? 0;
  const cancellationRate = jobCount ? ((cancelled.count ?? 0) / jobCount) * 100 : 0;

  const kpis = [
    { label: t.admin.kpi.totalUsers, value: String(users.count ?? 0), icon: Users },
    { label: t.admin.kpi.activeProviders, value: String(providers.count ?? 0), icon: ShieldCheck },
    { label: t.admin.kpi.jobsToday, value: String(jobsToday.count ?? 0), icon: Briefcase },
    { label: t.admin.kpi.jobsCompleted, value: String(completed.count ?? 0), icon: CheckCircle2 },
    { label: t.admin.kpi.gmv, price: gmv, icon: TrendingUp },
    { label: t.admin.kpi.revenue, price: revenue, icon: CreditCard },
    { label: t.admin.kpi.avgRating, value: avgRating ? avgRating.toFixed(2) : '—', icon: Star },
    { label: t.admin.kpi.cancellationRate, value: `${cancellationRate.toFixed(1)}%`, icon: XCircle },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t.admin.overview}</h1>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ label, value, price, icon: Icon }) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <Icon className="size-4 text-muted-foreground" aria-hidden />
            <dd className="num mt-2 text-2xl font-bold">
              {price !== undefined ? <Price amount={price} /> : value}
            </dd>
            <dt className="text-xs text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>

      <div className="grid gap-3 sm:grid-cols-2">
        {(pending.count ?? 0) > 0 ? (
          <Card className="border-warning/40 bg-warning/5">
            <CardContent className="flex items-center gap-3 pt-5">
              <ShieldCheck className="size-6 text-warning" aria-hidden />
              <p className="text-sm">
                <span className="num font-bold">{pending.count}</span> בעלי מקצוע ממתינים לאימות —{' '}
                <Link href="/admin/providers?status=pending" className="text-accent hover:underline">
                  לטיפול
                </Link>
              </p>
            </CardContent>
          </Card>
        ) : null}

        {(disputes.count ?? 0) > 0 ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="flex items-center gap-3 pt-5">
              <AlertTriangle className="size-6 text-destructive" aria-hidden />
              <p className="text-sm">
                <span className="num font-bold">{disputes.count}</span> תלונות פתוחות —{' '}
                <Link href="/admin/disputes" className="text-accent hover:underline">
                  לטיפול
                </Link>
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
