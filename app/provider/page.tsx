import Link from 'next/link';
import type { Metadata } from 'next';
import { AlertTriangle, ArrowLeft, Briefcase, Star, Timer, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Price } from '@/components/ui/price';
import { StatusBadge } from '@/components/ui/status-badge';
import { AvailabilityToggle } from '@/features/provider/components/availability-toggle';
import { ProviderJobFeed } from '@/features/provider/components/job-feed';
import { getServerSupabase } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/auth/session';
import { getServerDictionary } from '@/lib/i18n/server';
import { formatEta } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'לוח בקרה' };

export default async function ProviderDashboard() {
  const [{ t }, session] = await Promise.all([getServerDictionary(), getSessionContext()]);
  const supabase = await getServerSupabase();

  if (!session?.providerId || !supabase) {
    return (
      <Card>
        <CardContent className="pt-5">
          <p>{t.errors.generic}</p>
        </CardContent>
      </Card>
    );
  }

  const [{ data: profile }, { data: availability }, { data: earnings }] = await Promise.all([
    supabase
      .from('provider_profiles')
      .select(
        'id, business_name, status, status_reason, rating_avg, rating_count, completed_jobs, avg_response_seconds, onboarding_completed',
      )
      .eq('id', session.providerId)
      .maybeSingle(),
    supabase
      .from('provider_availability')
      .select('is_available')
      .eq('provider_id', session.providerId)
      .maybeSingle(),
    supabase
      .from('payments')
      .select('provider_payout, status')
      .eq('provider_id', session.providerId)
      .eq('status', 'captured'),
  ]);

  const totalEarnings = (earnings ?? []).reduce((sum, row) => sum + Number(row.provider_payout), 0);
  const verified = profile?.status === 'verified';

  return (
    <div className="space-y-5">
      {/* Verification banners */}
      {!profile?.onboarding_completed ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
            <div>
              <p className="font-semibold">{t.provider.completeOnboarding}</p>
              <p className="text-sm text-muted-foreground">
                כדי לקבל עבודות צריך להשלים פרטי עסק, אזורי שירות ומסמכים.
              </p>
            </div>
            <Button asChild variant="accent" size="sm">
              <Link href="/provider/onboarding">
                {t.provider.completeOnboarding}
                <ArrowLeft aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : !verified ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex items-start gap-3 pt-5">
            <AlertTriangle className="size-5 shrink-0 text-warning" aria-hidden />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">
                  {profile?.status === 'rejected'
                    ? t.provider.rejected
                    : profile?.status === 'suspended'
                      ? t.provider.suspended
                      : t.provider.pendingVerification}
                </p>
                <StatusBadge kind="provider" status={profile?.status ?? 'pending'} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {profile?.status_reason ?? t.provider.pendingVerificationBody}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <AvailabilityToggle
        initiallyAvailable={availability?.is_available ?? false}
        canGoOnline={verified}
      />

      {/* KPIs */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: t.provider.completedJobs,
            value: String(profile?.completed_jobs ?? 0),
            icon: Briefcase,
          },
          {
            label: t.common.rating,
            value: profile?.rating_count ? Number(profile.rating_avg).toFixed(1) : '—',
            icon: Star,
          },
          {
            label: t.provider.responseTime,
            value: profile?.avg_response_seconds
              ? formatEta(Math.round(profile.avg_response_seconds / 60))
              : '—',
            icon: Timer,
          },
          { label: t.provider.earnings, value: null, icon: Wallet },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <Icon className="size-4 text-muted-foreground" aria-hidden />
            <dd className="num mt-2 text-lg font-bold">
              {value === null ? <Price amount={totalEarnings} /> : value}
            </dd>
            <dt className="text-xs text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>

      {/* Lead feed */}
      <section aria-labelledby="new-jobs">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="new-jobs" className="text-lg font-semibold">
            {t.provider.newJobs}
          </h2>
          <Button asChild variant="link" size="sm">
            <Link href="/provider/jobs">{t.common.viewAll}</Link>
          </Button>
        </div>
        {verified ? (
          <ProviderJobFeed providerId={session.providerId} />
        ) : (
          <Card>
            <CardContent className="pt-5 text-sm text-muted-foreground">
              {t.provider.pendingVerificationBody}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
