'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ConnectionBanner,
  ErrorState,
  LoadingState,
  Minutes,
  Money,
  Rating,
  Spinner,
} from '@/components/ui';
import { Logo } from '@/components/brand';
import { apiFetch, ApiRequestError } from '@/lib/client/api';
import { usePolling, useRealtime } from '@/lib/client/use-realtime';
import { JobTimeline } from './job-timeline';
import { ProviderProfileSheet } from './provider-profile-sheet';
import { PaymentPanel } from './payment-panel';
import { ReviewPanel } from './review-panel';

type JobStatus =
  | 'REQUESTED' | 'SEARCHING' | 'OFFERS_AVAILABLE' | 'PROVIDER_SELECTED'
  | 'CONFIRMED' | 'EN_ROUTE' | 'ARRIVED' | 'IN_PROGRESS'
  | 'AWAITING_CUSTOMER_CONFIRMATION' | 'COMPLETED' | 'PAID' | 'REVIEWED'
  | 'CANCELLED_BY_CUSTOMER' | 'CANCELLED_BY_PROVIDER' | 'CANCELLED_BY_SYSTEM'
  | 'DISPUTED';

interface JobData {
  job: {
    id: string;
    status: JobStatus;
    raw_description: string;
    urgency: string;
    booking_mode: string;
    address_text: string | null;
    quoted_price_ils: string | null;
    final_price_ils: string | null;
    dispatch_wave: number;
    dispatch_radius_km: string | null;
    category_name: string | null;
    service_name: string | null;
    service_slug: string | null;
    created_at: string;
  };
  assignment: {
    id: string;
    provider_id: string;
    price_ils: string;
    eta_minutes: number | null;
    provider_name: string;
    business_name: string | null;
    rating_avg: string | null;
    rating_count: number;
    completed_jobs: number;
    en_route_at: string | null;
    arrived_at: string | null;
  } | null;
  payment: {
    id: string;
    status: string;
    gross_amount: number;
    provider_name: string;
  } | null;
  reviews: { id: string; direction: string; rating: number }[];
}

const STATUS_COPY: Record<JobStatus, { title: string; tone: 'neutral' | 'brand' | 'ok' | 'warn' | 'bad' }> = {
  REQUESTED: { title: 'הבקשה נרשמה', tone: 'neutral' },
  SEARCHING: { title: 'מחפשים מקצוען', tone: 'brand' },
  OFFERS_AVAILABLE: { title: 'מחפשים מקצוען', tone: 'brand' },
  PROVIDER_SELECTED: { title: 'מצאנו לך מקצוען', tone: 'ok' },
  CONFIRMED: { title: 'ההזמנה אושרה', tone: 'ok' },
  EN_ROUTE: { title: 'המקצוען בדרך אליך', tone: 'brand' },
  ARRIVED: { title: 'המקצוען הגיע', tone: 'ok' },
  IN_PROGRESS: { title: 'העבודה מתבצעת', tone: 'brand' },
  AWAITING_CUSTOMER_CONFIRMATION: { title: 'העבודה הושלמה — נדרש אישורך', tone: 'warn' },
  COMPLETED: { title: 'העבודה הושלמה', tone: 'ok' },
  PAID: { title: 'שולם', tone: 'ok' },
  REVIEWED: { title: 'תודה על הדירוג', tone: 'ok' },
  CANCELLED_BY_CUSTOMER: { title: 'ביטלת את ההזמנה', tone: 'neutral' },
  CANCELLED_BY_PROVIDER: { title: 'המקצוען ביטל — מחפשים אחר', tone: 'warn' },
  CANCELLED_BY_SYSTEM: { title: 'לא מצאנו מקצוען זמין', tone: 'bad' },
  DISPUTED: { title: 'נפתחה מחלוקת', tone: 'bad' },
};

export function JobLiveView({ jobId }: { jobId: string }) {
  const [data, setData] = useState<JobData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  // Opening a profile must not navigate away: the match, its price and its
  // ETA stay mounted behind the sheet and are exactly what closing returns
  // to (spec §47).
  const [profileOpen, setProfileOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  /**
   * The ONLY way state enters this component: re-read the authoritative row.
   * Realtime events merely trigger this (spec §22, §24).
   */
  const refetch = useCallback(async () => {
    try {
      const fresh = await apiFetch<JobData>(`/api/jobs/${jobId}`);
      setData(fresh);
      setError(null);
    } catch (caught) {
      if (caught instanceof ApiRequestError) {
        setError(caught.message);
      } else {
        setError('לא הצלחנו לטעון את פרטי העבודה.');
      }
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  // The abort flag is not just lint hygiene: without it a slow first response
  // can land after the component moved on, or after a newer refetch already
  // applied fresher data.
  useEffect(() => {
    let active = true;
    void (async () => {
      const fresh = await apiFetch<JobData>(`/api/jobs/${jobId}`).catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof ApiRequestError ? caught.message : 'לא הצלחנו לטעון את פרטי העבודה.',
          );
        }
        return null;
      });
      if (!active) return;
      if (fresh) {
        setData(fresh);
        setError(null);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [jobId]);

  const { connection } = useRealtime({
    onChange: () => {
      void refetch();
    },
  });

  const status = data?.job.status;
  const isLive =
    status !== undefined &&
    !['COMPLETED', 'PAID', 'REVIEWED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SYSTEM'].includes(status);

  // Safety net: realtime is an optimisation, never a dependency.
  usePolling(() => void refetch(), status === 'SEARCHING' || status === 'OFFERS_AVAILABLE' ? 4000 : 15_000, isLive);

  const transition = async (to: JobStatus, reason?: string) => {
    setActing(true);
    setActionError(null);
    try {
      await apiFetch(`/api/jobs/${jobId}/transition`, { method: 'POST', json: { to, reason } });
      await refetch();
    } catch (caught) {
      setActionError(caught instanceof ApiRequestError ? caught.message : 'הפעולה נכשלה');
      // Always resync: the server may have advanced past what we believed.
      await refetch();
    } finally {
      setActing(false);
    }
  };

  if (loading) return <LoadingState label="טוען את הקריאה…" />;

  if (error && !data) {
    return (
      <div className="space-y-4">
        <Logo />
        <ErrorState message={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  if (!data) return <ErrorState message="העבודה לא נמצאה" />;

  const { job, assignment, payment, reviews } = data;
  const copy = STATUS_COPY[job.status];

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <Logo />
        <Badge tone={copy.tone}>{copy.title}</Badge>
      </header>

      <ConnectionBanner state={connection} />

      {/* ── SEARCHING: the radar moment ─────────────────────────────────── */}
      {(job.status === 'SEARCHING' || job.status === 'OFFERS_AVAILABLE') && (
        <Card className="text-center">
          <div className="relative mx-auto flex size-28 items-center justify-center">
            <span className="gs-pulse-ring absolute size-20 rounded-full bg-brand/30" />
            <span className="absolute size-20 rounded-full border border-brand/40" />
            <div className="gs-sweep absolute size-24 rounded-full border-t-2 border-brand-bright" />
            <span aria-hidden="true" className="text-3xl">🔧</span>
          </div>
          <h2 className="mt-5 text-xl font-bold text-ink">מחפשים לך מקצוען…</h2>
          <p className="mt-2 text-sm text-ink-2">
            בודקים מי פנוי, מי קרוב ומי כבר נוסע לאזור שלך.
          </p>
          {job.dispatch_radius_km && (
            <p className="mt-3 text-sm text-ink-3">
              סבב {job.dispatch_wave} — רדיוס{' '}
              <span className="ltr-nums" dir="ltr">
                {Number(job.dispatch_radius_km)} km
              </span>
            </p>
          )}
          <Button
            variant="quiet"
            size="md"
            className="mt-5"
            loading={acting}
            onClick={() => void transition('CANCELLED_BY_CUSTOMER', 'ביטול על ידי הלקוח')}
          >
            ביטול החיפוש
          </Button>
        </Card>
      )}

      {/* ── MATCH FOUND: one clear recommendation (spec §10) ────────────── */}
      {assignment && job.status === 'PROVIDER_SELECTED' && (
        <Card className="border-ok/40">
          <p className="text-sm font-semibold text-ok-bright">מצאנו לך מקצוען</p>

          <div className="mt-2 flex items-start gap-3">
            <Avatar name={assignment.provider_name} size={48} />
            <div className="min-w-0 flex-1">
              <h2 className="text-[22px] font-black leading-tight text-ink">
                {assignment.provider_name}
              </h2>
              {assignment.business_name && (
                <p className="truncate text-sm text-ink-2">{assignment.business_name}</p>
              )}
              <div className="mt-1">
                <Rating
                  value={assignment.rating_avg ? Number(assignment.rating_avg) : null}
                  count={assignment.rating_count}
                />
              </div>
            </div>
            {/* Progressive disclosure: everything else about this person is
                one tap away, and the tap does not cost the match. */}
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2.5 text-[13px] font-semibold text-brand-bright hover:bg-surface-2"
            >
              פרטים
              <span aria-hidden="true">›</span>
            </button>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-bg p-3">
              <dt className="text-xs text-ink-2">הגעה משוערת</dt>
              <dd className="mt-1 text-2xl font-black text-ink">
                <Minutes value={assignment.eta_minutes} />
                <span className="ms-1 text-sm font-normal text-ink-2">דקות</span>
              </dd>
            </div>
            <div className="rounded-xl bg-bg p-3">
              <dt className="text-xs text-ink-2">מחיר</dt>
              <dd className="mt-1 text-2xl font-black text-ink">
                <Money shekels={Number(assignment.price_ils)} />
              </dd>
            </div>
          </dl>

          <p className="mt-3 text-xs text-ink-3">
            זמן ההגעה הוא הערכה ומתעדכן בזמן אמת. המחיר מאושר על ידי המקצוען.
          </p>

          {actionError && (
            <p role="alert" className="mt-3 rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad-bright">
              {actionError}
            </p>
          )}

          <div className="mt-5 space-y-3">
            <Button size="xl" fullWidth loading={acting} onClick={() => void transition('CONFIRMED')}>
              הזמן עכשיו
            </Button>
            <Button
              variant="quiet"
              size="md"
              fullWidth
              loading={acting}
              onClick={() => void transition('CANCELLED_BY_CUSTOMER', 'הלקוח דחה את ההתאמה')}
            >
              לא, תודה
            </Button>
          </div>
        </Card>
      )}

      {/* ── IN FLIGHT: tracking ─────────────────────────────────────────── */}
      {assignment && ['CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(job.status) && (
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <Avatar name={assignment.provider_name} size={40} />
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => setProfileOpen(true)}
                  className="truncate text-start text-xl font-bold text-ink underline decoration-line-strong decoration-1 underline-offset-4"
                >
                  {assignment.provider_name}
                </button>
                <div className="mt-1">
                  <Rating
                    value={assignment.rating_avg ? Number(assignment.rating_avg) : null}
                    count={assignment.rating_count}
                  />
                </div>
              </div>
            </div>
            <div className="text-end">
              <p className="text-xs text-ink-2">מחיר</p>
              <p className="text-xl font-black text-ink">
                <Money shekels={Number(assignment.price_ils)} />
              </p>
            </div>
          </div>

          {job.status === 'EN_ROUTE' && (
            <div className="mt-4 rounded-xl bg-brand/10 p-4 text-center">
              <p className="text-sm font-semibold text-brand-bright">המקצוען בדרך אליך</p>
              <p className="mt-1 text-3xl font-black text-ink">
                <Minutes value={assignment.eta_minutes} />
                <span className="ms-1 text-base font-normal text-ink-2">דקות</span>
              </p>
              <p className="mt-1 text-xs text-ink-3">הערכה — מתעדכנת לפי המיקום בפועל</p>
            </div>
          )}

          {job.status === 'ARRIVED' && (
            <div className="mt-4 rounded-xl bg-ok/10 p-4 text-center">
              <p className="text-lg font-bold text-ok-bright">המקצוען הגיע</p>
            </div>
          )}

          {job.status === 'IN_PROGRESS' && (
            <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-bg p-4">
              <Spinner className="size-5 text-brand-bright" />
              <p className="font-semibold text-ink">העבודה מתבצעת</p>
            </div>
          )}

          {job.status === 'CONFIRMED' && (
            <p className="mt-4 rounded-xl bg-bg p-4 text-center text-sm text-ink-2">
              ההזמנה אושרה. המקצוען יעדכן כשיצא לדרך.
            </p>
          )}

          {actionError && (
            <p role="alert" className="mt-3 rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad-bright">
              {actionError}
            </p>
          )}

          <Button
            variant="quiet"
            size="md"
            fullWidth
            className="mt-4"
            loading={acting}
            onClick={() => void transition('CANCELLED_BY_CUSTOMER', 'ביטול על ידי הלקוח')}
          >
            ביטול ההזמנה
          </Button>
        </Card>
      )}

      {/* ── Work done, needs the customer's confirmation ────────────────── */}
      {job.status === 'AWAITING_CUSTOMER_CONFIRMATION' && (
        <Card className="border-warn/40">
          <h2 className="text-lg font-bold text-ink">המקצוען סיים את העבודה</h2>
          <p className="mt-2 text-sm text-ink-2">
            אשרו שהעבודה בוצעה כדי להמשיך לתשלום.
          </p>
          {actionError && (
            <p role="alert" className="mt-3 rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad-bright">
              {actionError}
            </p>
          )}
          <div className="mt-5 space-y-3">
            <Button size="xl" fullWidth variant="success" loading={acting} onClick={() => void transition('COMPLETED')}>
              כן, העבודה בוצעה
            </Button>
            <Button
              variant="danger"
              size="md"
              fullWidth
              loading={acting}
              onClick={() => void transition('DISPUTED', 'הלקוח פתח מחלוקת')}
            >
              יש בעיה עם העבודה
            </Button>
          </div>
        </Card>
      )}

      {/* ── Payment, then review ───────────────────────────────────────── */}
      {(job.status === 'COMPLETED' || job.status === 'PAID' || job.status === 'REVIEWED') && (
        <>
          <PaymentPanel
            jobId={jobId}
            status={job.status}
            payment={payment}
            priceIls={Number(job.final_price_ils ?? assignment?.price_ils ?? 0)}
            onChanged={() => void refetch()}
          />
          {(job.status === 'PAID' || job.status === 'REVIEWED') && assignment && (
            <ReviewPanel
              jobId={jobId}
              providerName={assignment.provider_name}
              alreadyReviewed={reviews.some((r) => r.direction === 'customer_to_provider')}
              onChanged={() => void refetch()}
            />
          )}
        </>
      )}

      {/* ── Nobody found: honest dead end with a way forward ───────────── */}
      {job.status === 'CANCELLED_BY_SYSTEM' && (
        <Card className="border-bad/40">
          <h2 className="text-lg font-bold text-ink">לא מצאנו מקצוען זמין</h2>
          <p className="mt-2 text-sm text-ink-2">
            חיפשנו בכל הרדיוסים ולא נמצא מקצוען פנוי ומתאים כרגע. אפשר לנסות שוב
            או לקבוע למועד אחר.
          </p>
          <Link href="/" className="mt-5 block">
            <Button fullWidth>נסו שוב</Button>
          </Link>
        </Card>
      )}

      {job.status === 'CANCELLED_BY_CUSTOMER' && (
        <Card>
          <h2 className="text-lg font-bold text-ink">ההזמנה בוטלה</h2>
          <Link href="/" className="mt-5 block">
            <Button variant="secondary" fullWidth>
              חזרה לדף הבית
            </Button>
          </Link>
        </Card>
      )}

      {/* ── What was asked for ─────────────────────────────────────────── */}
      <Card>
        <h2 className="text-sm font-semibold text-ink-2">הבקשה שלך</h2>
        <p className="mt-2 text-ink">{job.raw_description}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {job.category_name && <Badge tone="brand">{job.category_name}</Badge>}
          {job.service_name && <Badge>{job.service_name}</Badge>}
        </div>
        {job.address_text && <p className="mt-3 text-sm text-ink-2">{job.address_text}</p>}
      </Card>

      <JobTimeline jobId={jobId} refreshKey={job.status} />

      {/* Mounted beside the match rather than in place of it, so closing it
          returns to the screen the customer was deciding on. */}
      {assignment && (
        <ProviderProfileSheet
          providerId={assignment.provider_id}
          serviceSlug={job.service_slug}
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </div>
  );
}
