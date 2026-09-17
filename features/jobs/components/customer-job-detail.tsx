'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, MapPin, MessageSquare, Phone, Radar, Star, XCircle } from 'lucide-react';
import type { JobDetailPayload } from '@/features/jobs/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { OfferCard } from '@/components/ui/offer-card';
import { PriceBreakdown } from '@/components/ui/price';
import { Map } from '@/components/ui/map';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Avatar } from '@/components/ui/avatar';
import { Rating } from '@/components/ui/rating';
import { JobTimeline } from './job-timeline';
import { ReviewForm } from './review-form';
import { CancelJobDialog, DisputeDialog } from './action-dialogs';
import { useApi } from '@/hooks/use-api';
import { useRealtime } from '@/hooks/use-realtime';
import { useT } from '@/components/providers/i18n-provider';
import { postJson } from '@/features/auth/lib/form';
import { formatDateTime } from '@/lib/utils/format';
import { isActive } from '@/lib/services/jobs/workflow';
import { navigationUrlFor } from '@/lib/services/maps/links';

interface ProviderLocation {
  lat: number;
  lng: number;
  updated_at: string;
}

/**
 * The customer's view of a single job.
 *
 * Everything that can change while the screen is open — status, incoming
 * offers, the provider's position — arrives over Supabase Realtime. There is
 * no polling anywhere in this component.
 */
export function CustomerJobDetail({ jobId }: { jobId: string }) {
  const t = useT();
  const { data, loading, error, reload } = useApi<JobDetailPayload>(`/api/jobs/${jobId}`);

  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [providerLocation, setProviderLocation] = useState<ProviderLocation | null>(null);

  useRealtime<Record<string, unknown>>({
    table: 'jobs',
    filter: `id=eq.${jobId}`,
    onChange: reload,
  });
  useRealtime<Record<string, unknown>>({
    table: 'job_offers',
    filter: `job_id=eq.${jobId}`,
    onChange: reload,
  });

  const providerId = data?.job.assigned_provider_id ?? null;
  useRealtime<ProviderLocation & Record<string, unknown>>({
    table: 'provider_locations',
    filter: providerId ? `provider_id=eq.${providerId}` : undefined,
    enabled: Boolean(providerId),
    onChange: (payload) => {
      const next = payload.new as ProviderLocation | undefined;
      if (next?.lat && next?.lng) setProviderLocation(next);
    },
  });

  const acceptOffer = useCallback(
    async (offerId: string) => {
      setAcceptingId(offerId);
      setActionError(null);
      try {
        await postJson(`/api/offers/${offerId}/accept`, {});
        await reload();
      } catch (acceptError) {
        setActionError(acceptError instanceof Error ? acceptError.message : t.errors.generic);
      } finally {
        setAcceptingId(null);
      }
    },
    [reload, t.errors.generic],
  );

  if (loading && !data) return <LoadingState />;
  if (error || !data) return <ErrorState description={error ?? undefined} onRetry={reload} />;

  const { job, offers, payment, review } = data;
  const pendingOffers = offers.filter((offer) => offer.status === 'pending');
  const acceptedOffer = offers.find((offer) => offer.status === 'accepted');
  const showMap = ['provider_selected', 'provider_on_the_way', 'arrived', 'in_progress'].includes(
    job.status,
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-lg">{job.title}</CardTitle>
              <p className="num mt-0.5 text-xs text-muted-foreground">
                {t.job.reference} {job.reference}
              </p>
            </div>
            <StatusBadge kind="job" status={job.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="whitespace-pre-line text-sm">{job.description}</p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">{t.job.category}</dt>
              <dd className="font-medium">{job.category?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t.job.urgency}</dt>
              <dd className="font-medium">{t.job.urgencyLabel[job.urgency]}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">{t.job.address}</dt>
              <dd className="flex items-center gap-1 font-medium">
                <MapPin className="size-4 text-muted-foreground" aria-hidden />
                {job.address}
                {job.address_notes ? (
                  <span className="text-muted-foreground"> · {job.address_notes}</span>
                ) : null}
              </dd>
            </div>
            {job.scheduled_for ? (
              <div className="col-span-2">
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

      {/* Searching */}
      {['requested', 'searching'].includes(job.status) && pendingOffers.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <span className="relative flex size-14 items-center justify-center rounded-full bg-accent/10">
                <Radar className="size-7 animate-pulse text-accent" aria-hidden />
              </span>
              <p className="font-semibold">{t.job.searching}</p>
              <p className="text-sm text-muted-foreground">{t.job.searchingHint}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Offers */}
      {pendingOffers.length > 0 && !acceptedOffer ? (
        <section aria-labelledby="offers">
          <h2 id="offers" className="mb-3 text-lg font-semibold">
            {t.job.offersCount} (<span className="num">{pendingOffers.length}</span>)
          </h2>
          <ul className="space-y-3">
            {pendingOffers.map((offer) => (
              <li key={offer.id}>
                <OfferCard
                  offer={{
                    id: offer.id,
                    price: Number(offer.price),
                    etaMinutes: offer.eta_minutes,
                    note: offer.note,
                    status: offer.status,
                    validUntil: offer.valid_until,
                    distanceKm: offer.distance_km === null ? null : Number(offer.distance_km),
                    createdAt: offer.created_at,
                    provider: {
                      id: offer.provider?.id ?? '',
                      businessName: offer.provider?.business_name ?? '—',
                      avatarUrl: offer.provider?.avatar_url ?? null,
                      ratingAvg: Number(offer.provider?.rating_avg ?? 0),
                      ratingCount: offer.provider?.rating_count ?? 0,
                      completedJobs: offer.provider?.completed_jobs ?? 0,
                      isVerified: offer.provider?.status === 'verified',
                    },
                  }}
                  action={
                    <>
                      {offer.provider ? (
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/app/providers/${offer.provider.id}`}>{t.common.details}</Link>
                        </Button>
                      ) : null}
                      <Button
                        variant="success"
                        size="sm"
                        loading={acceptingId === offer.id}
                        onClick={() => acceptOffer(offer.id)}
                      >
                        {t.offer.accept}
                      </Button>
                    </>
                  }
                />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">{t.payment.breakdownNotice}</p>
        </section>
      ) : null}

      {job.status === 'offers_received' && pendingOffers.length === 0 && !acceptedOffer ? (
        <EmptyState title={t.empty.noOffers} />
      ) : null}

      {/* Assigned provider */}
      {job.assigned_provider ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.job.provider}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Avatar
                src={job.assigned_provider.avatar_url}
                name={job.assigned_provider.business_name}
                size="lg"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{job.assigned_provider.business_name}</p>
                <Rating
                  value={Number(job.assigned_provider.rating_avg)}
                  count={job.assigned_provider.rating_count}
                  size="sm"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={`tel:${job.assigned_provider.phone}`}>
                  <Phone aria-hidden />
                  התקשר
                </a>
              </Button>
              <Button asChild variant="accent" size="sm">
                <Link href={`/app/messages/${job.id}`}>
                  <MessageSquare aria-hidden />
                  {t.job.chat}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Live map */}
      {showMap ? (
        <section aria-labelledby="live-map">
          <h2 id="live-map" className="mb-3 text-lg font-semibold">
            {t.job.trackProvider}
          </h2>
          <Map
            center={providerLocation ?? { lat: job.lat, lng: job.lng }}
            markers={[
              { id: 'customer', position: { lat: job.lat, lng: job.lng }, label: 'הכתובת שלך', kind: 'customer' },
              ...(providerLocation
                ? [
                    {
                      id: 'provider',
                      position: { lat: providerLocation.lat, lng: providerLocation.lng },
                      label: job.assigned_provider?.business_name ?? 'בעל המקצוע',
                      kind: 'provider' as const,
                    },
                  ]
                : []),
            ]}
            etaMinutes={acceptedOffer?.eta_minutes ?? null}
            distanceKm={
              acceptedOffer?.distance_km === null || acceptedOffer?.distance_km === undefined
                ? null
                : Number(acceptedOffer.distance_km)
            }
            radiusKm={3}
          />
          {!providerLocation ? (
            <p className="mt-2 text-xs text-muted-foreground">
              מיקום בעל המקצוע יוצג ברגע שהוא יצא לדרך.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Payment */}
      {payment ? (
        <section aria-labelledby="payment">
          <h2 id="payment" className="mb-3 text-lg font-semibold">
            {t.payment.title}
          </h2>
          <PriceBreakdown
            rows={[{ label: t.payment.jobPrice, amount: Number(payment.amount) }]}
            total={{ label: t.payment.total, amount: Number(payment.amount) }}
            note={
              payment.status === 'captured'
                ? t.payment.captured
                : payment.status === 'authorized'
                  ? t.payment.authorized
                  : t.payment.breakdownNotice
            }
          />
        </section>
      ) : null}

      {/* Review */}
      {job.status === 'completed' && !review ? (
        <Card>
          <CardContent className="pt-5">
            <ReviewForm jobId={job.id} onDone={reload} />
          </CardContent>
        </Card>
      ) : null}

      {review ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="size-4 text-warning" aria-hidden />
              {t.job.review}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Rating value={Number(review.rating)} />
            {review.comment ? <p className="mt-2 text-sm">{review.comment}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Timeline */}
      <section aria-labelledby="timeline">
        <h2 id="timeline" className="mb-3 text-lg font-semibold">
          {t.job.timeline}
        </h2>
        <div className="rounded-xl border bg-card p-4">
          <JobTimeline status={job.status} history={job.job_status_history} />
        </div>
      </section>

      {/* Danger zone */}
      <div className="flex flex-wrap gap-2">
        {isActive(job.status) ? (
          <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)}>
            <XCircle aria-hidden />
            {t.job.cancelJob}
          </Button>
        ) : null}
        {['in_progress', 'completed'].includes(job.status) ? (
          <Button variant="ghost" size="sm" onClick={() => setDisputeOpen(true)}>
            <AlertTriangle aria-hidden />
            {t.job.openDispute}
          </Button>
        ) : null}
        {job.assigned_provider ? (
          <Button asChild variant="ghost" size="sm">
            <a
              href={navigationUrlFor(job.lat, job.lng, job.address)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MapPin aria-hidden />
              פתח במפות
            </a>
          </Button>
        ) : null}
      </div>

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
