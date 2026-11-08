'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, MapPin, MessageSquare, Navigation, Phone, PlayCircle, Truck } from 'lucide-react';
import type { JobDetailPayload } from '@/features/jobs/types';
import type { JobStatus } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { PriceBreakdown } from '@/components/ui/price';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { JobTimeline } from '@/features/jobs/components/job-timeline';
import { OfferDialog } from './offer-dialog';
import { CancelJobDialog, DisputeDialog } from '@/features/jobs/components/action-dialogs';
import { useApi } from '@/hooks/use-api';
import { useRealtime } from '@/hooks/use-realtime';
import { useT } from '@/components/providers/i18n-provider';
import { postJson } from '@/features/auth/lib/form';
import { formatDateTime, formatPrice } from '@/lib/utils/format';
import { navigationUrlFor } from '@/lib/services/maps/links';
import { acceptsOffers } from '@/lib/services/jobs/workflow';

/** Next status the provider can move the job to, with its button label. */
const NEXT_ACTION: Partial<
  Record<JobStatus, { to: Exclude<JobStatus, 'completed'>; labelKey: 'onTheWay' | 'arrived' | 'startJob'; icon: typeof Truck }>
> = {
  provider_selected: { to: 'provider_on_the_way', labelKey: 'onTheWay', icon: Truck },
  provider_on_the_way: { to: 'arrived', labelKey: 'arrived', icon: MapPin },
  arrived: { to: 'in_progress', labelKey: 'startJob', icon: PlayCircle },
};

export function ProviderJobDetail({ jobId, providerId }: { jobId: string; providerId: string }) {
  const t = useT();
  const { data, loading, error, reload } = useApi<JobDetailPayload>(`/api/jobs/${jobId}`);

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [offerOpen, setOfferOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);

  useRealtime<Record<string, unknown>>({ table: 'jobs', filter: `id=eq.${jobId}`, onChange: reload });

  /**
   * Marking arrival sends the device's position with it.
   *
   * The server compares it with the job's address, so "הגעתי" becomes something
   * checkable instead of a claim. Without permission the server decides whether
   * to accept the status at all — the client does not quietly skip it.
   */
  const advance = useCallback(
    async (status: string) => {
      setBusy(true);
      setActionError(null);
      try {
        const position = status === 'arrived' ? await currentPosition() : null;
        await postJson(`/api/jobs/${jobId}/status`, {
          status,
          ...(position ? { lat: position.lat, lng: position.lng } : {}),
        });
        await reload();
      } catch (advanceError) {
        setActionError(advanceError instanceof Error ? advanceError.message : t.errors.generic);
      } finally {
        setBusy(false);
      }
    },
    [jobId, reload, t.errors.generic],
  );

  const complete = useCallback(async () => {
    setBusy(true);
    setActionError(null);
    try {
      await postJson(`/api/jobs/${jobId}/complete`, {});
      await reload();
    } catch (completeError) {
      setActionError(completeError instanceof Error ? completeError.message : t.errors.generic);
    } finally {
      setBusy(false);
    }
  }, [jobId, reload, t.errors.generic]);

  if (loading && !data) return <LoadingState />;
  if (error || !data) return <ErrorState description={error ?? undefined} onRetry={reload} />;

  const { job, offers } = data;
  const myOffer = offers.find((offer) => offer.provider?.id === providerId);
  const isMine = job.assigned_provider_id === providerId;
  const next = isMine ? NEXT_ACTION[job.status] : undefined;
  const customerName = job.customer?.profiles?.full_name ?? 'לקוח';

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-lg">{job.title}</CardTitle>
              <p className="num mt-0.5 text-xs text-muted-foreground">
                {t.job.reference} {job.reference}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <StatusBadge kind="job" status={job.status} />
              <Badge variant="secondary">{t.job.urgencyLabel[job.urgency]}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="whitespace-pre-line text-sm">{job.description}</p>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">{t.job.category}</dt>
              <dd className="font-medium">{job.category?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t.job.budget}</dt>
              <dd className="num font-medium">
                {job.budget_min || job.budget_max
                  ? [
                      job.budget_min ? formatPrice(Number(job.budget_min)) : null,
                      job.budget_max ? formatPrice(Number(job.budget_max)) : null,
                    ]
                      .filter(Boolean)
                      .join(' – ')
                  : '—'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">{t.job.address}</dt>
              {/* Full address is visible once the provider is assigned. */}
              <dd className="font-medium">
                {isMine ? job.address : `${job.address.split(',').slice(-2).join(', ').trim()} (אזור)`}
                {isMine && job.address_notes ? (
                  <span className="text-muted-foreground"> · {job.address_notes}</span>
                ) : null}
              </dd>
            </div>
            {job.scheduled_for ? (
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">{t.wizard.scheduledFor}</dt>
                <dd className="font-medium">{formatDateTime(job.scheduled_for)}</dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      {actionError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive">
          {actionError}
        </p>
      ) : null}

      {/* Offer */}
      {!isMine && acceptsOffers(job.status) ? (
        myOffer ? (
          <Card>
            <CardHeader>
              <CardTitle>{t.offer.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <PriceBreakdown
                rows={[{ label: t.offer.price, amount: Number(myOffer.price) }]}
                total={{ label: t.offer.price, amount: Number(myOffer.price) }}
                note={`${t.offer.eta}: ${myOffer.eta_minutes} ${t.common.minutes} · ${t.offer.validUntil} ${formatDateTime(myOffer.valid_until)}`}
              />
              {myOffer.status === 'pending' ? (
                <Button
                  variant="outline"
                  size="sm"
                  loading={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await postJson(`/api/offers/${myOffer.id}/withdraw`, {});
                      await reload();
                    } catch (withdrawError) {
                      setActionError(
                        withdrawError instanceof Error ? withdrawError.message : t.errors.generic,
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {t.offer.withdraw}
                </Button>
              ) : (
                <StatusBadge kind="offer" status={myOffer.status} />
              )}
            </CardContent>
          </Card>
        ) : (
          <Button variant="success" size="full" onClick={() => setOfferOpen(true)}>
            {t.offer.send}
          </Button>
        )
      ) : null}

      {/* Assigned: customer contact + workflow actions */}
      {isMine ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t.job.customer}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Avatar src={job.customer?.profiles?.avatar_url} name={customerName} />
                <p className="min-w-0 flex-1 truncate font-medium">{customerName}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {job.customer?.phone ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={`tel:${job.customer.phone}`}>
                      <Phone aria-hidden />
                      התקשר
                    </a>
                  </Button>
                ) : null}
                <Button asChild variant="accent" size="sm">
                  <Link href={`/provider/messages/${job.id}`}>
                    <MessageSquare aria-hidden />
                    {t.job.chat}
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="sm">
                  <a
                    href={navigationUrlFor(job.lat, job.lng, job.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Navigation aria-hidden />
                    {t.provider.navigate}
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/*
            Two different facts, so two different lines: what to collect from
            the customer, and the commission that already left the balance.
          */}
          {job.final_price !== null ? (
            <PriceBreakdown
              rows={[
                { label: t.provider.grossPrice, amount: Number(job.final_price) },
                {
                  label: t.provider.platformFee,
                  amount: Number(job.commission_amount ?? 0),
                  negative: true,
                  muted: true,
                },
              ]}
              total={{
                label: t.provider.netPayout,
                amount: Number(job.final_price) - Number(job.commission_amount ?? 0),
              }}
              note={
                job.commission_refunded_at
                  ? 'העמלה הוחזרה ליתרה שלך.'
                  : job.commission_charged_at
                    ? 'העמלה נגבתה מהיתרה בעת קבלת העבודה. את מחיר העבודה אתה גובה ישירות מהלקוח.'
                    : t.payment.payProviderDirectly
              }
            />
          ) : null}

          {/* Verification state, in the provider's own interest to complete */}
          {isMine && job.commission_charged_at ? (
            <div className="rounded-xl border bg-card p-3 text-xs">
              <p className="mb-1.5 font-medium">אימות העבודה</p>
              <ul className="space-y-1 text-muted-foreground">
                <li className={job.arrival_verified_at ? 'text-success' : undefined}>
                  {job.arrival_verified_at
                    ? `${t.provider.arrivalVerified} (${Math.round(Number(job.arrival_distance_m ?? 0))} מ' מהכתובת)`
                    : t.provider.arrivalUnverified}
                </li>
                <li className={job.customer_confirmed_at ? 'text-success' : undefined}>
                  {job.customer_confirmed_at
                    ? t.provider.customerConfirmed
                    : t.provider.awaitingConfirmation}
                </li>
              </ul>
              {!job.arrival_verified_at && job.status !== 'completed' ? (
                <p className="mt-2">
                  סימון &quot;הגעתי&quot; מהכתובת עצמה הוא מה שמאמת את ההגעה, וזה מה שמגן עליך
                  אם הלקוח יטען אחר כך שלא באת.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {next ? (
              <Button variant="accent" size="lg" loading={busy} onClick={() => advance(next.to)}>
                <next.icon aria-hidden />
                {t.provider[next.labelKey]}
              </Button>
            ) : null}
            {job.status === 'in_progress' ? (
              <Button variant="success" size="lg" loading={busy} onClick={complete}>
                <CheckCircle2 aria-hidden />
                {t.provider.completeJob}
              </Button>
            ) : null}
            {['provider_selected', 'provider_on_the_way', 'arrived', 'in_progress'].includes(
              job.status,
            ) ? (
              <Button variant="ghost" size="sm" onClick={() => setCancelOpen(true)}>
                {t.common.cancel}
              </Button>
            ) : null}
            {['in_progress', 'completed'].includes(job.status) ? (
              <Button variant="ghost" size="sm" onClick={() => setDisputeOpen(true)}>
                {t.job.openDispute}
              </Button>
            ) : null}
          </div>
        </>
      ) : null}

      <section aria-labelledby="timeline">
        <h2 id="timeline" className="mb-3 text-lg font-semibold">
          {t.job.timeline}
        </h2>
        <div className="rounded-xl border bg-card p-4">
          <JobTimeline status={job.status} history={job.job_status_history} />
        </div>
      </section>

      <OfferDialog
        jobId={job.id}
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        onDone={() => {
          setOfferOpen(false);
          void reload();
        }}
      />
      <CancelJobDialog
        jobId={job.id}
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onDone={reload}
      />
      <DisputeDialog
        jobId={job.id}
        open={disputeOpen}
        onClose={() => setDisputeOpen(false)}
        onDone={reload}
      />
    </div>
  );
}

/**
 * One reading of the device position, or null if it cannot be had.
 *
 * Never throws: a refused permission is not an error to show, it is simply a
 * check-in without coordinates, which the server then rules on.
 */
async function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  });
}
