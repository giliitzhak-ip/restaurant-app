'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  ConnectionBanner,
  Distance,
  EmptyState,
  ErrorState,
  LoadingState,
  Minutes,
  Money,
  Rating,
} from '@/components/ui';
import { Logo } from '@/components/brand';
import { apiFetch, ApiRequestError } from '@/lib/client/api';
import { usePolling, useRealtime } from '@/lib/client/use-realtime';

interface Offer {
  id: string;
  job_id: string;
  price_ils: string;
  eta_minutes: number | null;
  eta_confidence: string;
  distance_km: string | null;
  is_on_the_way: boolean;
  expires_at: string;
  raw_description: string;
  urgency: string;
  category_name: string | null;
  service_name: string | null;
}

interface ActiveJob {
  job_id: string;
  price_ils: string;
  eta_minutes: number | null;
  status: string;
  raw_description: string;
  address_text: string | null;
  address_notes: string | null;
  lat: number;
  lon: number;
  customer_name: string;
  customer_phone: string | null;
  category_name: string | null;
  service_name: string | null;
}

interface ProviderData {
  offers: Offer[];
  active: ActiveJob | null;
  profile: {
    state: 'OFFLINE' | 'ONLINE' | 'BUSY';
    verification: string;
    rating_avg: string | null;
    rating_count: number;
    completed_jobs: number;
    full_name: string;
    is_configured: boolean;
  } | null;
}

/** Next action available to the provider, by job status. */
const NEXT_STEP: Record<string, { to: string; label: string; variant: 'primary' | 'success' }> = {
  CONFIRMED: { to: 'EN_ROUTE', label: 'יוצא לדרך', variant: 'primary' },
  EN_ROUTE: { to: 'ARRIVED', label: 'הגעתי', variant: 'primary' },
  ARRIVED: { to: 'IN_PROGRESS', label: 'מתחיל לעבוד', variant: 'primary' },
  IN_PROGRESS: { to: 'AWAITING_CUSTOMER_CONFIRMATION', label: 'סיימתי את העבודה', variant: 'success' },
};

export function ProviderConsole() {
  const [data, setData] = useState<ProviderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [locationNote, setLocationNote] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const fresh = await apiFetch<ProviderData>('/api/provider/offers');
      setData(fresh);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'לא הצלחנו לטעון נתונים');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const fresh = await apiFetch<ProviderData>('/api/provider/offers').catch(
        (caught: unknown) => {
          if (active) {
            setError(
              caught instanceof ApiRequestError ? caught.message : 'לא הצלחנו לטעון נתונים',
            );
          }
          return null;
        },
      );
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
  }, []);

  const { connection } = useRealtime({ onChange: () => void refetch() });
  usePolling(() => void refetch(), 10_000, true);

  const state = data?.profile?.state ?? 'OFFLINE';
  const activeStatus = data?.active?.status;

  /* ── Location reporting (spec §18) ─────────────────────────────────────
     Interval depends on state: frequent while EN_ROUTE, sparse when merely
     ONLINE, nothing at all when OFFLINE. The server dictates the cadence. */
  const intervalRef = useRef<number>(60);
  useEffect(() => {
    if (state === 'OFFLINE') return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const report = () => {
      if (cancelled || !navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          if (cancelled) return;
          const { latitude, longitude, accuracy, heading, speed } = position.coords;
          try {
            const response = await apiFetch<{ nextIntervalSeconds: number | null }>(
              '/api/provider/location',
              {
                method: 'POST',
                json: {
                  lat: latitude,
                  lon: longitude,
                  accuracyM: Number.isFinite(accuracy) ? accuracy : null,
                  // Passed through as null when absent rather than zeroed:
                  // a parked van is not "heading due north".
                  headingDeg: heading !== null && Number.isFinite(heading) ? heading : null,
                  speedKmh: speed !== null && Number.isFinite(speed) ? speed * 3.6 : null,
                },
              },
            );
            intervalRef.current = response.nextIntervalSeconds ?? 60;
            setLocationNote(null);
          } catch {
            setLocationNote('לא הצלחנו לעדכן מיקום. ייתכן שלא תקבל עבודות חדשות.');
          }
          if (!cancelled) timer = setTimeout(report, intervalRef.current * 1000);
        },
        () => {
          // Honest about it: without GPS the provider is effectively invisible
          // to matching, and no position is invented (spec §44).
          setLocationNote('אין גישה למיקום. בלי מיקום לא נוכל לשלוח לך עבודות.');
          if (!cancelled) timer = setTimeout(report, 30_000);
        },
        { enableHighAccuracy: activeStatus === 'EN_ROUTE', timeout: 10_000, maximumAge: 5_000 },
      );
    };

    report();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [state, activeStatus]);

  const setAvailability = async (next: 'ONLINE' | 'OFFLINE') => {
    setBusy('state');
    setActionError(null);
    try {
      await apiFetch('/api/provider/state', { method: 'POST', json: { state: next } });
      await refetch();
    } catch (caught) {
      setActionError(caught instanceof ApiRequestError ? caught.message : 'לא הצלחנו לשנות מצב');
    } finally {
      setBusy(null);
    }
  };

  const respond = async (offerId: string, action: 'accept' | 'decline') => {
    setBusy(offerId);
    setActionError(null);
    try {
      await apiFetch(`/api/offers/${offerId}/${action}`, { method: 'POST' });
      await refetch();
    } catch (caught) {
      if (caught instanceof ApiRequestError) {
        // JOB_ALREADY_ASSIGNED and OFFER_EXPIRED are normal in a live market,
        // not errors to apologise for.
        setActionError(caught.message);
      } else {
        setActionError('הפעולה נכשלה');
      }
      await refetch();
    } finally {
      setBusy(null);
    }
  };

  const advance = async (to: string) => {
    if (!data?.active) return;
    setBusy('advance');
    setActionError(null);
    try {
      await apiFetch(`/api/jobs/${data.active.job_id}/transition`, {
        method: 'POST',
        json: { to },
      });
      await refetch();
    } catch (caught) {
      setActionError(caught instanceof ApiRequestError ? caught.message : 'הפעולה נכשלה');
      await refetch();
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <LoadingState label="טוען…" />;
  if (error && !data) return <ErrorState message={error} onRetry={() => void refetch()} />;

  const profile = data?.profile;
  const active = data?.active ?? null;
  const offers = data?.offers ?? [];
  const nextStep = activeStatus ? NEXT_STEP[activeStatus] : undefined;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <Logo />
        {profile && (
          <Rating
            value={profile.rating_avg ? Number(profile.rating_avg) : null}
            count={profile.rating_count}
          />
        )}
      </header>

      <ConnectionBanner state={connection} />

      {/* ── Availability: the one control that matters most ─────────────── */}
      <Card>
        <p className="text-lg font-bold text-ink">שלום {profile?.full_name ?? ''}</p>

        {/* Setup comes before verification: verifying an account with no
            declared trade achieves nothing, because the candidate search
            would still never return it. */}
        {profile && !profile.is_configured ? (
          <div className="mt-3 rounded-xl border border-brand/40 bg-brand/10 p-4">
            <p className="font-semibold text-brand-bright">צריך להשלים את הפרופיל</p>
            <p className="mt-1 text-sm text-ink-2">
              בלי תחום ומחירים לא נשלח לך עבודות — המערכת לא תכלול אותך בחיפוש.
            </p>
            <Link href="/provider/onboarding" className="mt-3 block">
              <Button fullWidth size="md">
                הגדר את הפרופיל
              </Button>
            </Link>
          </div>
        ) : profile?.verification !== 'VERIFIED' ? (
          <div className="mt-3 rounded-xl border border-warn/40 bg-warn/10 p-4">
            <p className="font-semibold text-warn-bright">החשבון ממתין לאימות</p>
            <p className="mt-1 text-sm text-ink-2">
              הפרופיל מוגדר. לא ניתן לקבל עבודות עד שמנהל יאמת את הפרטים והמסמכים.
            </p>
            <Link href="/provider/onboarding" className="mt-3 block">
              <Button fullWidth size="md" variant="secondary">
                עדכן את הפרטים
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div>
                <Badge tone={state === 'ONLINE' ? 'ok' : state === 'BUSY' ? 'brand' : 'neutral'}>
                  {state === 'ONLINE' ? 'ONLINE' : state === 'BUSY' ? 'בעבודה' : 'OFFLINE'}
                </Badge>
                <p className="mt-2 text-sm text-ink-2">
                  {state === 'ONLINE'
                    ? 'אתה זמין לקבל עבודות'
                    : state === 'BUSY'
                      ? 'יש לך עבודה פעילה'
                      : 'אתה לא מקוון — לא תקבל עבודות'}
                </p>
              </div>
              {state !== 'BUSY' && (
                <Button
                  size="lg"
                  variant={state === 'ONLINE' ? 'secondary' : 'success'}
                  loading={busy === 'state'}
                  onClick={() => void setAvailability(state === 'ONLINE' ? 'OFFLINE' : 'ONLINE')}
                >
                  {state === 'ONLINE' ? 'סיום משמרת' : 'התחל משמרת'}
                </Button>
              )}
            </div>

            {locationNote && state !== 'OFFLINE' && (
              <p className="mt-3 rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn-bright">
                {locationNote}
              </p>
            )}
          </>
        )}
      </Card>

      {actionError && (
        <p role="alert" className="rounded-xl bg-bad/10 px-4 py-3 text-sm text-bad-bright">
          {actionError}
        </p>
      )}

      {/* ── Active job: big buttons, minimal reading ───────────────────── */}
      {active && (
        <Card className="border-brand/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-brand-bright">{active.category_name}</p>
              <h2 className="text-xl font-bold text-ink">{active.service_name}</h2>
            </div>
            <p className="text-xl font-black text-ink">
              <Money shekels={Number(active.price_ils)} />
            </p>
          </div>

          <p className="mt-3 text-ink-2">{active.raw_description}</p>

          <div className="mt-4 rounded-xl bg-bg p-3">
            <p className="font-semibold text-ink">{active.customer_name}</p>
            {active.address_text && <p className="text-sm text-ink-2">{active.address_text}</p>}
            {active.address_notes && (
              <p className="text-sm text-ink-2">{active.address_notes}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {active.customer_phone && (
                <a
                  href={`tel:${active.customer_phone}`}
                  className="inline-flex min-h-11 items-center rounded-xl bg-surface-2 px-4 text-sm font-semibold text-ink"
                >
                  התקשר ללקוח
                </a>
              )}
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${active.lat},${active.lon}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center rounded-xl bg-surface-2 px-4 text-sm font-semibold text-ink"
              >
                ניווט
              </a>
            </div>
          </div>

          {activeStatus === 'PROVIDER_SELECTED' && (
            <p className="mt-4 rounded-xl bg-bg p-3 text-center text-sm text-ink-2">
              ממתין לאישור הלקוח…
            </p>
          )}

          {nextStep && (
            <Button
              size="xl"
              fullWidth
              variant={nextStep.variant}
              className="mt-4"
              loading={busy === 'advance'}
              onClick={() => void advance(nextStep.to)}
            >
              {nextStep.label}
            </Button>
          )}

          {activeStatus === 'AWAITING_CUSTOMER_CONFIRMATION' && (
            <p className="mt-4 rounded-xl bg-ok/10 p-3 text-center text-sm text-ok-bright">
              ממתין לאישור הלקוח ולתשלום
            </p>
          )}

          {activeStatus && ['CONFIRMED', 'EN_ROUTE', 'ARRIVED'].includes(activeStatus) && (
            <Button
              variant="quiet"
              size="md"
              fullWidth
              className="mt-2"
              loading={busy === 'advance'}
              onClick={() => void advance('CANCELLED_BY_PROVIDER')}
            >
              לא אוכל לבצע
            </Button>
          )}
        </Card>
      )}

      {/* ── Incoming offers (spec §19) ─────────────────────────────────── */}
      {!active && offers.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-ink-2">עבודות שמחכות לך</h2>
          {offers.map((offer) => (
            <Card
              key={offer.id}
              className={offer.is_on_the_way ? 'border-ok/50' : undefined}
            >
              {/* The route-opportunity signal, stated plainly — this is what
                  makes the offer worth taking. */}
              {offer.is_on_the_way && (
                <Badge tone="ok" className="mb-3">
                  🚗 עבודה בדרך שלך
                </Badge>
              )}

              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-brand-bright">{offer.category_name}</p>
                  <h3 className="text-lg font-bold text-ink">{offer.service_name}</h3>
                </div>
                {offer.urgency === 'emergency' && <Badge tone="bad">חירום</Badge>}
              </div>

              <p className="mt-2 line-clamp-2 text-sm text-ink-2">{offer.raw_description}</p>

              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-bg p-2">
                  <dt className="text-xs text-ink-2">מרחק</dt>
                  <dd className="text-base font-bold text-ink">
                    <Distance km={offer.distance_km ? Number(offer.distance_km) : null} />
                  </dd>
                </div>
                <div className="rounded-xl bg-bg p-2">
                  <dt className="text-xs text-ink-2">הגעה</dt>
                  <dd className="text-base font-bold text-ink">
                    <Minutes value={offer.eta_minutes} />
                    <span className="text-xs font-normal text-ink-2"> דק׳</span>
                  </dd>
                </div>
                <div className="rounded-xl bg-bg p-2">
                  <dt className="text-xs text-ink-2">שכר</dt>
                  <dd className="text-base font-bold text-ink">
                    <Money shekels={Number(offer.price_ils)} />
                  </dd>
                </div>
              </dl>

              <div className="mt-4 grid grid-cols-3 gap-3">
                <Button
                  size="xl"
                  variant="success"
                  className="col-span-2"
                  loading={busy === offer.id}
                  onClick={() => void respond(offer.id, 'accept')}
                >
                  קבל עבודה
                </Button>
                <Button
                  size="xl"
                  variant="secondary"
                  loading={busy === offer.id}
                  onClick={() => void respond(offer.id, 'decline')}
                >
                  דחה
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!active && offers.length === 0 && state === 'ONLINE' && (
        <EmptyState
          title="אין עבודות כרגע"
          message="נעדכן אותך ברגע שתגיע עבודה מתאימה באזור שלך."
        />
      )}

      {!active && state === 'OFFLINE' && profile?.verification === 'VERIFIED' && (
        <EmptyState
          title="אתה לא מקוון"
          message="התחל משמרת כדי לקבל עבודות."
          action={
            <Link href="/provider/onboarding">
              <Button variant="secondary" size="md">
                עדכן תחומים ומחירים
              </Button>
            </Link>
          }
        />
      )}
    </div>
  );
}
