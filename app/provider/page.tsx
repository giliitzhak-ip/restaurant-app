import Link from 'next/link';
import type { Metadata } from 'next';
import {
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  Star,
  Timer,
  Wallet,
  WalletMinimal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Price } from '@/components/ui/price';
import { StatusBadge } from '@/components/ui/status-badge';
import { AvailabilityToggle } from '@/features/provider/components/availability-toggle';
import { ProviderJobFeed } from '@/features/provider/components/job-feed';
import { balanceStatus } from '@/lib/services/billing';
import { getSetting } from '@/lib/services/settings';
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
        `id, business_name, status, status_reason, rating_avg, rating_count, completed_jobs,
         avg_response_seconds, onboarding_completed, balance`,
      )
      .eq('id', session.providerId)
      .maybeSingle(),
    supabase
      .from('provider_availability')
      .select('is_available')
      .eq('provider_id', session.providerId)
      .maybeSingle(),
    supabase
      .from('jobs')
      .select('final_price, commission_amount, commission_refunded_at')
      .eq('assigned_provider_id', session.providerId)
      .eq('status', 'completed')
      .not('commission_charged_at', 'is', null),
  ]);

  // What the provider collected from customers themselves — the platform never
  // held it, so this is the agreed price, not a figure it can vouch for.
  const totalCollected = (earnings ?? []).reduce(
    (sum, row) => sum + Number(row.final_price ?? 0),
    0,
  );
  const balance = Number(profile?.balance ?? 0);
  const billing = await getSetting('billing');
  const balanceState = balanceStatus(balance, billing);
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

      {/*
        A verified provider with no credit is online and invisible — the hardest
        state to diagnose from the outside, so it gets its own banner rather
        than being left to the balance page.
      */}
      {verified && balanceState.state !== 'ok' ? (
        <Card
          className={
            balanceState.state === 'blocked'
              ? 'border-destructive/40 bg-destructive/5'
              : 'border-warning/40 bg-warning/5'
          }
        >
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
            <div>
              <p className="font-semibold">
                {balanceState.state === 'blocked'
                  ? t.provider.balanceBlocked
                  : t.provider.balanceLow}
              </p>
              <p className="text-sm text-muted-foreground">
                יתרה נוכחית: <Price amount={balanceState.balance} size="sm" />
                {balanceState.shortfall > 0 ? (
                  <>
                    {' · '}נדרשת טעינה של <Price amount={balanceState.shortfall} size="sm" />
                  </>
                ) : null}
              </p>
            </div>
            <Button asChild variant="accent" size="sm">
              <Link href="/provider/balance">
                {t.provider.topupCta}
                <ArrowLeft aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <AvailabilityToggle
        initiallyAvailable={availability?.is_available ?? false}
        canGoOnline={verified && balanceState.canAcceptWork}
      />

      {/* KPIs */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: t.provider.completedJobs,
            value: String(profile?.completed_jobs ?? 0),
            amount: undefined,
            icon: Briefcase,
          },
          {
            label: t.common.rating,
            value: profile?.rating_count ? Number(profile.rating_avg).toFixed(1) : '—',
            amount: undefined,
            icon: Star,
          },
          {
            label: t.provider.responseTime,
            value: profile?.avg_response_seconds
              ? formatEta(Math.round(profile.avg_response_seconds / 60))
              : '—',
            amount: undefined,
            icon: Timer,
          },
          { label: t.provider.collectedDirectly, value: undefined, amount: totalCollected, icon: Wallet },
          {
            label: t.provider.balance,
            value: undefined,
            amount: balance,
            icon: WalletMinimal,
            href: '/provider/balance',
          },
        ].map(({ label, value, amount, icon: Icon, href }) => {
          const tile = (
            <>
              <Icon className="size-4 text-muted-foreground" aria-hidden />
              <dd className="num mt-2 text-lg font-bold">
                {amount === undefined ? value : <Price amount={amount} />}
              </dd>
              <dt className="text-xs text-muted-foreground">{label}</dt>
            </>
          );
          return href ? (
            <Link
              key={label}
              href={href}
              className="rounded-xl border bg-card p-4 transition hover:border-brand"
            >
              {tile}
            </Link>
          ) : (
            <div key={label} className="rounded-xl border bg-card p-4">
              {tile}
            </div>
          );
        })}
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
