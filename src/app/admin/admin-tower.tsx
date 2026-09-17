'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  ConnectionBanner,
  ErrorState,
  LoadingState,
  Money,
} from '@/components/ui';
import { Logo } from '@/components/brand';
import { apiFetch, ApiRequestError } from '@/lib/client/api';
import { usePolling, useRealtime } from '@/lib/client/use-realtime';
import { LiveMap } from './live-map';

interface Overview {
  counters: Record<string, string>;
  analytics: Record<string, string | null>;
  liveJobs: {
    id: string; status: string; raw_description: string; urgency: string;
    lat: number; lon: number; dispatch_wave: number; created_at: string;
    category_name: string | null; customer_name: string | null; provider_name: string | null;
  }[];
  liveProviders: {
    id: string; full_name: string; state: string; lat: number; lon: number;
    heading_deg: string | null; age_seconds: string; category_name: string | null;
  }[];
  pendingVerification: {
    id: string; full_name: string; email: string; created_at: string;
    category_name: string | null; priced_services: number; is_configured: boolean;
  }[];
  tradeProposals: {
    id: string; proposed_name: string; description: string | null;
    price_ils: string | null; created_at: string;
    provider_name: string; provider_email: string; provider_verification: string;
    suggested_category_name: string | null; suggested_category_slug: string | null;
    similar_services: number;
  }[];
  categories: { slug: string; name_he: string }[];
  /** Totals behind the capped lists, so a truncated queue says so. */
  totals: { pendingVerification: number; pendingTrades: number; liveProviders: number; liveJobs: number };
  shown: { pendingVerification: number; tradeProposals: number; liveProviders: number; liveJobs: number };
}

/** "12" when everything is shown, "50 מתוך 137" when it is not. */
function countLabel(shown: number, total: number): string {
  return shown < total ? `${shown} מתוך ${total}` : `${total}`;
}

/** Control tower (spec §33). */
export function AdminTower() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Per-proposal review form: which category, and the phrases that make it
   *  reachable. Keyed by proposal id so two reviews cannot cross over. */
  const [review, setReview] = useState<Record<string, { category: string; phrases: string; reason: string }>>({});

  const refetch = useCallback(async () => {
    const fresh = await apiFetch<Overview>('/api/admin/overview').catch((caught: unknown) => {
      setError(caught instanceof ApiRequestError ? caught.message : 'לא הצלחנו לטעון נתונים');
      return null;
    });
    if (fresh) {
      setData(fresh);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const fresh = await apiFetch<Overview>('/api/admin/overview').catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof ApiRequestError ? caught.message : 'לא הצלחנו לטעון נתונים');
        }
        return null;
      });
      if (!active) return;
      if (fresh) setData(fresh);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const { connection } = useRealtime({ onChange: () => void refetch() });
  usePolling(() => void refetch(), 10_000, true);

  const act = async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    setNotice(null);
    try {
      await apiFetch('/api/admin/actions', { method: 'POST', json: body });
      setNotice(`בוצע: ${label}`);
      await refetch();
    } catch (caught) {
      setNotice(caught instanceof ApiRequestError ? caught.message : 'הפעולה נכשלה');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <LoadingState label="טוען את מרכז הבקרה…" />;
  if (error && !data) return <ErrorState message={error} onRetry={() => void refetch()} />;
  if (!data) return <ErrorState message="אין נתונים" />;

  const c = data.counters;
  const a = data.analytics;

  const tiles: { label: string; value: string; tone?: 'brand' | 'warn' | 'bad' | 'ok' }[] = [
    { label: 'מקצוענים מחוברים', value: c.providers_online ?? '0', tone: 'ok' },
    { label: 'בעבודה', value: c.providers_busy ?? '0', tone: 'brand' },
    { label: 'עבודות פעילות', value: c.active_jobs ?? '0', tone: 'brand' },
    { label: 'בחיפוש', value: c.searching_jobs ?? '0', tone: 'warn' },
    { label: 'ללא התאמה (24ש)', value: c.unmatched_jobs ?? '0', tone: 'bad' },
    { label: 'בדרך', value: c.en_route ?? '0' },
    { label: 'מחלוקות פתוחות', value: c.open_disputes ?? '0', tone: 'bad' },
    { label: 'הושלמו היום', value: c.completed_today ?? '0', tone: 'ok' },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Logo />
          <h1 className="text-xl font-bold text-ink">מרכז בקרה</h1>
        </div>
        <nav className="flex gap-2">
          <Link href="/matching-lab">
            <Button variant="secondary" size="md">
              מעבדת התאמה
            </Button>
          </Link>
        </nav>
      </header>

      <ConnectionBanner state={connection} />

      {notice && (
        <p role="status" className="rounded-xl bg-brand/10 px-4 py-3 text-sm text-brand-bright">
          {notice}
        </p>
      )}

      {/* ── Live counters ─────────────────────────────────────────────── */}
      <section aria-label="מדדים חיים">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map((tile) => (
            <Card key={tile.label} className="p-4">
              <p className="text-xs text-ink-2">{tile.label}</p>
              <p
                className={`ltr-nums mt-1 text-3xl font-black ${
                  tile.tone === 'bad' && Number(tile.value) > 0
                    ? 'text-bad-bright'
                    : tile.tone === 'warn' && Number(tile.value) > 0
                      ? 'text-warn-bright'
                      : tile.tone === 'ok'
                        ? 'text-ok-bright'
                        : 'text-ink'
                }`}
                dir="ltr"
              >
                {tile.value}
              </p>
            </Card>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-ink-2">הכנסות היום</p>
            <p className="mt-1 text-2xl font-black text-ink">
              <Money agorot={Number(c.revenue_today_agorot ?? 0)} />
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-ink-2">עמלות היום</p>
            <p className="mt-1 text-2xl font-black text-ink">
              <Money agorot={Number(c.platform_fees_today_agorot ?? 0)} />
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-ink-2">ממתינים לאימות</p>
            <p className="ltr-nums mt-1 text-2xl font-black text-warn-bright" dir="ltr">
              {c.providers_pending ?? '0'}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-ink-2">השלמות (7 ימים)</p>
            <p className="ltr-nums mt-1 text-2xl font-black text-ok-bright" dir="ltr">
              {a.completions_7d ?? '0'}
            </p>
          </Card>
        </div>
      </section>

      {/* ── North star and funnel (spec §37) ─────────────────────────── */}
      <Card>
        <h2 className="text-sm font-semibold text-ink-2">
          מדדי מפתח — כוכב הצפון: השלמות מוצלחות
        </h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            ['זמן להצעה ראשונה', a.time_to_first_offer_s, 's'],
            ['זמן להתאמה', a.time_to_match_s, 's'],
            ['שיעור התאמה', a.match_rate_pct, '%'],
            ['שיעור השלמה', a.completion_rate_pct, '%'],
            ['שיעור היענות', a.acceptance_rate_pct, '%'],
            ['שיעור ביטולים', a.cancellation_rate_pct, '%'],
            ['ללא התאמה', a.unmatched_rate_pct, '%'],
            ['זמן תגובת מקצוען', a.provider_response_time_s, 's'],
          ].map(([label, value, unit]) => (
            <div key={String(label)}>
              <dt className="text-xs text-ink-2">{label}</dt>
              <dd className="ltr-nums mt-1 text-lg font-bold text-ink" dir="ltr">
                {value === null || value === undefined ? '—' : `${value}${unit}`}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-ink-3">
          חושב על נתוני 7 הימים האחרונים. במצב הדגמה הנתונים מבוססים על נתוני דמו.
        </p>
      </Card>

      {/* ── Live map ─────────────────────────────────────────────────── */}
      <LiveMap jobs={data.liveJobs} providers={data.liveProviders} />
      <p className="-mt-2 text-xs text-ink-3">
        מוצגים{' '}
        <span className="ltr-nums" dir="ltr">
          {countLabel(data.shown.liveProviders, data.totals.liveProviders)}
        </span>{' '}
        מקצוענים מחוברים ו-
        <span className="ltr-nums" dir="ltr">
          {countLabel(data.shown.liveJobs, data.totals.liveJobs)}
        </span>{' '}
        עבודות פעילות. המפה מוגבלת בכוונה — היא כלי מבט, לא רשימה מלאה.
      </p>

      {/* ── Provider-proposed trades ─────────────────────────────────────
          A provider whose trade is missing from the catalog cannot be found
          at all, so this queue is how the catalog grows. Approving REQUIRES
          the phrases a customer would type: the classifier routes on them,
          and a service approved without any can never be reached by any
          description — the provider would be told "approved" and still never
          get a job. */}
      {data.tradeProposals.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold text-ink-2">
            מקצועות שהוצעו{' '}
            <span className="ltr-nums text-ink-3" dir="ltr">
              ({countLabel(data.shown.tradeProposals, data.totals.pendingTrades)})
            </span>
          </h2>

          <div className="mt-3 space-y-3">
            {data.tradeProposals.map((proposal) => {
              const form = review[proposal.id] ?? {
                category: proposal.suggested_category_slug ?? '',
                phrases: '',
                reason: '',
              };
              const set = (patch: Partial<typeof form>) =>
                setReview((current) => ({ ...current, [proposal.id]: { ...form, ...patch } }));
              const phrases = form.phrases
                .split(',')
                .map((phrase) => phrase.trim())
                .filter((phrase) => phrase.length >= 2);

              return (
                <div key={proposal.id} className="rounded-xl border border-line bg-bg p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-ink">{proposal.proposed_name}</p>
                      <p className="text-xs text-ink-3">
                        {proposal.provider_name} ·{' '}
                        <span className="tech-id">{proposal.provider_email}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {proposal.price_ils && (
                        <Badge>
                          <Money shekels={Number(proposal.price_ils)} />
                        </Badge>
                      )}
                      {proposal.suggested_category_name && (
                        <Badge tone="neutral">הציע: {proposal.suggested_category_name}</Badge>
                      )}
                      <Badge tone={proposal.provider_verification === 'VERIFIED' ? 'ok' : 'warn'}>
                        {proposal.provider_verification === 'VERIFIED' ? 'מאומת' : 'לא מאומת'}
                      </Badge>
                    </div>
                  </div>

                  {proposal.description && (
                    <p className="mt-2 text-sm text-ink-2">{proposal.description}</p>
                  )}

                  {/* Approving a near-duplicate creates a second service that
                      means the same thing, and splits the providers between
                      them. Worth seeing before deciding. */}
                  {proposal.similar_services > 0 && (
                    <p className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn-bright">
                      יש כבר{' '}
                      <span className="ltr-nums" dir="ltr">
                        {proposal.similar_services}
                      </span>{' '}
                      שירותים עם שם דומה — שווה לבדוק אם זה כבר קיים.
                    </p>
                  )}

                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <div>
                      <label
                        className="mb-1 block text-xs text-ink-3"
                        htmlFor={`cat-${proposal.id}`}
                      >
                        תחום שאליו ייכנס
                      </label>
                      <select
                        id={`cat-${proposal.id}`}
                        value={form.category}
                        onChange={(event) => set({ category: event.target.value })}
                        className="min-h-11 w-full rounded-lg border border-line-strong bg-surface-2 px-3 text-sm text-ink"
                      >
                        <option value="">בחרו תחום…</option>
                        {data.categories.map((c) => (
                          <option key={c.slug} value={c.slug}>
                            {c.name_he}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        className="mb-1 block text-xs text-ink-3"
                        htmlFor={`ph-${proposal.id}`}
                      >
                        ביטויים שלקוח יכתוב (מופרדים בפסיק) — חובה
                      </label>
                      <input
                        id={`ph-${proposal.id}`}
                        value={form.phrases}
                        onChange={(event) => set({ phrases: event.target.value })}
                        placeholder="מכונת כביסה, מייבש כבסים"
                        className="min-h-11 w-full rounded-lg border border-line-strong bg-surface-2 px-3 text-sm text-ink"
                      />
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-ink-3">
                    בלי ביטויים אף תיאור של לקוח לא ינותב לשירות הזה, והאישור יהיה חסר משמעות.
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      size="md"
                      loading={busy === `approve-${proposal.id}`}
                      disabled={form.category === '' || phrases.length === 0}
                      onClick={() =>
                        void act(
                          {
                            action: 'approve_trade',
                            proposalId: proposal.id,
                            categorySlug: form.category,
                            phrases,
                          },
                          `approve-${proposal.id}`,
                        )
                      }
                    >
                      אשר והוסף לקטלוג
                    </Button>
                    <input
                      value={form.reason}
                      onChange={(event) => set({ reason: event.target.value })}
                      placeholder="סיבת דחייה"
                      aria-label={`סיבת דחייה עבור ${proposal.proposed_name}`}
                      className="min-h-11 flex-1 rounded-lg border border-line-strong bg-surface-2 px-3 text-sm text-ink"
                    />
                    <Button
                      size="md"
                      variant="danger"
                      loading={busy === `reject-${proposal.id}`}
                      disabled={form.reason.trim().length < 3}
                      onClick={() =>
                        void act(
                          {
                            action: 'reject_trade',
                            proposalId: proposal.id,
                            reason: form.reason.trim(),
                          },
                          `reject-${proposal.id}`,
                        )
                      }
                    >
                      דחה
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Verification queue ───────────────────────────────────────── */}
      {data.pendingVerification.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold text-ink-2">
            ממתינים לאימות{' '}
            <span className="ltr-nums text-ink-3" dir="ltr">
              ({countLabel(data.shown.pendingVerification, data.totals.pendingVerification)})
            </span>
          </h2>
          <ul className="mt-3 divide-y divide-line">
            {data.pendingVerification.map((provider) => (
              <li key={provider.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-ink">{provider.full_name}</p>
                  <p className="tech-id text-xs text-ink-3">{provider.email}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {provider.is_configured ? (
                      <>
                        <Badge tone="brand">{provider.category_name}</Badge>
                        <span className="ltr-nums text-xs text-ink-3" dir="ltr">
                          {provider.priced_services} services priced
                        </span>
                      </>
                    ) : (
                      <Badge tone="warn">לא הגדיר תחום — אימות לא יועיל</Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="md"
                    variant="success"
                    disabled={!provider.is_configured}
                    loading={busy === `אימות ${provider.full_name}`}
                    onClick={() =>
                      void act(
                        { action: 'verify_provider', providerId: provider.id },
                        `אימות ${provider.full_name}`,
                      )
                    }
                  >
                    אמת
                  </Button>
                  <Button
                    size="md"
                    variant="danger"
                    loading={busy === `דחיית ${provider.full_name}`}
                    onClick={() =>
                      void act(
                        {
                          action: 'reject_provider',
                          providerId: provider.id,
                          reason: 'נדחה מתוך מרכז הבקרה',
                        },
                        `דחיית ${provider.full_name}`,
                      )
                    }
                  >
                    דחה
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Live jobs ────────────────────────────────────────────────── */}
      <Card>
        <h2 className="text-sm font-semibold text-ink-2">עבודות חיות</h2>
        {data.liveJobs.length === 0 ? (
          <p className="mt-3 text-sm text-ink-3">אין עבודות פעילות כרגע.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="text-xs text-ink-2">
                  <th scope="col" className="p-2 text-start">מצב</th>
                  <th scope="col" className="p-2 text-start">תחום</th>
                  <th scope="col" className="p-2 text-start">תיאור</th>
                  <th scope="col" className="p-2 text-start">לקוח</th>
                  <th scope="col" className="p-2 text-start">מקצוען</th>
                  <th scope="col" className="p-2 text-start">סבב</th>
                  <th scope="col" className="p-2 text-start">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-2">
                {data.liveJobs.map((job) => (
                  <tr key={job.id}>
                    <td className="p-2">
                      <Badge
                        tone={
                          job.status === 'SEARCHING' || job.status === 'OFFERS_AVAILABLE'
                            ? 'warn'
                            : job.status === 'EN_ROUTE'
                              ? 'live'
                              : 'neutral'
                        }
                      >
                        {job.status}
                      </Badge>
                    </td>
                    <td className="p-2 text-ink-2">{job.category_name ?? '—'}</td>
                    <td className="max-w-xs truncate p-2 text-ink-2">{job.raw_description}</td>
                    <td className="p-2 text-ink-2">{job.customer_name ?? '—'}</td>
                    <td className="p-2 text-ink-2">{job.provider_name ?? '—'}</td>
                    <td className="ltr-nums p-2 text-ink-2" dir="ltr">{job.dispatch_wave}</td>
                    <td className="p-2">
                      <div className="flex gap-2">
                        <Link href={`/admin/jobs/${job.id}`}>
                          <Button size="md" variant="secondary">
                            נתח
                          </Button>
                        </Link>
                        {(job.status === 'SEARCHING' || job.status === 'OFFERS_AVAILABLE') && (
                          <Button
                            size="md"
                            variant="secondary"
                            loading={busy === `שיגור מחדש ${job.id}`}
                            onClick={() =>
                              void act(
                                { action: 'redispatch_job', jobId: job.id },
                                `שיגור מחדש ${job.id}`,
                              )
                            }
                          >
                            שגר מחדש
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
