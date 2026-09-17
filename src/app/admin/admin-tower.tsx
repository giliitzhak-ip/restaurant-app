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
  pendingVerification: { id: string; full_name: string; email: string; created_at: string }[];
}

/** Control tower (spec §33). */
export function AdminTower() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  const tiles: { label: string; value: string; tone?: 'accent' | 'warning' | 'danger' | 'success' }[] = [
    { label: 'מקצוענים מחוברים', value: c.providers_online ?? '0', tone: 'success' },
    { label: 'בעבודה', value: c.providers_busy ?? '0', tone: 'accent' },
    { label: 'עבודות פעילות', value: c.active_jobs ?? '0', tone: 'accent' },
    { label: 'בחיפוש', value: c.searching_jobs ?? '0', tone: 'warning' },
    { label: 'ללא התאמה (24ש)', value: c.unmatched_jobs ?? '0', tone: 'danger' },
    { label: 'בדרך', value: c.en_route ?? '0' },
    { label: 'מחלוקות פתוחות', value: c.open_disputes ?? '0', tone: 'danger' },
    { label: 'הושלמו היום', value: c.completed_today ?? '0', tone: 'success' },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Logo />
          <h1 className="text-xl font-bold text-white">מרכז בקרה</h1>
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
        <p role="status" className="rounded-xl bg-accent-500/10 px-4 py-3 text-sm text-accent-400">
          {notice}
        </p>
      )}

      {/* ── Live counters ─────────────────────────────────────────────── */}
      <section aria-label="מדדים חיים">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map((tile) => (
            <Card key={tile.label} className="p-4">
              <p className="text-xs text-slate-400">{tile.label}</p>
              <p
                className={`ltr-nums mt-1 text-3xl font-black ${
                  tile.tone === 'danger' && Number(tile.value) > 0
                    ? 'text-danger-400'
                    : tile.tone === 'warning' && Number(tile.value) > 0
                      ? 'text-warning-400'
                      : tile.tone === 'success'
                        ? 'text-success-400'
                        : 'text-white'
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
            <p className="text-xs text-slate-400">הכנסות היום</p>
            <p className="mt-1 text-2xl font-black text-white">
              <Money agorot={Number(c.revenue_today_agorot ?? 0)} />
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-400">עמלות היום</p>
            <p className="mt-1 text-2xl font-black text-white">
              <Money agorot={Number(c.platform_fees_today_agorot ?? 0)} />
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-400">ממתינים לאימות</p>
            <p className="ltr-nums mt-1 text-2xl font-black text-warning-400" dir="ltr">
              {c.providers_pending ?? '0'}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-400">השלמות (7 ימים)</p>
            <p className="ltr-nums mt-1 text-2xl font-black text-success-400" dir="ltr">
              {a.completions_7d ?? '0'}
            </p>
          </Card>
        </div>
      </section>

      {/* ── North star and funnel (spec §37) ─────────────────────────── */}
      <Card>
        <h2 className="text-sm font-semibold text-slate-300">
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
              <dt className="text-xs text-slate-400">{label}</dt>
              <dd className="ltr-nums mt-1 text-lg font-bold text-white" dir="ltr">
                {value === null || value === undefined ? '—' : `${value}${unit}`}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-slate-500">
          חושב על נתוני 7 הימים האחרונים. במצב הדגמה הנתונים מבוססים על נתוני דמו.
        </p>
      </Card>

      {/* ── Live map ─────────────────────────────────────────────────── */}
      <LiveMap jobs={data.liveJobs} providers={data.liveProviders} />

      {/* ── Verification queue ───────────────────────────────────────── */}
      {data.pendingVerification.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold text-slate-300">ממתינים לאימות</h2>
          <ul className="mt-3 divide-y divide-navy-700">
            {data.pendingVerification.map((provider) => (
              <li key={provider.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-white">{provider.full_name}</p>
                  <p className="tech-id text-xs text-slate-500">{provider.email}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="md"
                    variant="success"
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
        <h2 className="text-sm font-semibold text-slate-300">עבודות חיות</h2>
        {data.liveJobs.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">אין עבודות פעילות כרגע.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="text-xs text-slate-400">
                  <th scope="col" className="p-2 text-start">מצב</th>
                  <th scope="col" className="p-2 text-start">תחום</th>
                  <th scope="col" className="p-2 text-start">תיאור</th>
                  <th scope="col" className="p-2 text-start">לקוח</th>
                  <th scope="col" className="p-2 text-start">מקצוען</th>
                  <th scope="col" className="p-2 text-start">סבב</th>
                  <th scope="col" className="p-2 text-start">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800">
                {data.liveJobs.map((job) => (
                  <tr key={job.id}>
                    <td className="p-2">
                      <Badge
                        tone={
                          job.status === 'SEARCHING' || job.status === 'OFFERS_AVAILABLE'
                            ? 'warning'
                            : job.status === 'EN_ROUTE'
                              ? 'accent'
                              : 'neutral'
                        }
                      >
                        {job.status}
                      </Badge>
                    </td>
                    <td className="p-2 text-slate-300">{job.category_name ?? '—'}</td>
                    <td className="max-w-xs truncate p-2 text-slate-300">{job.raw_description}</td>
                    <td className="p-2 text-slate-400">{job.customer_name ?? '—'}</td>
                    <td className="p-2 text-slate-400">{job.provider_name ?? '—'}</td>
                    <td className="ltr-nums p-2 text-slate-400" dir="ltr">{job.dispatch_wave}</td>
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
