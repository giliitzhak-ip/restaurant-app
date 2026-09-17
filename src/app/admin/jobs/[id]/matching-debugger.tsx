'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, ErrorState, LoadingState, Money } from '@/components/ui';
import { apiFetch, ApiRequestError } from '@/lib/client/api';

interface Candidate {
  provider_id: string;
  full_name: string;
  wave: number;
  excluded_reason: string | null;
  route_opportunity_score: string | null;
  skill_score: string | null;
  availability_score: string | null;
  eta_score: string | null;
  reliability_score: string | null;
  rating_score: string | null;
  price_score: string | null;
  experience_score: string | null;
  final_score: string | null;
  weights_used: Record<string, number>;
  is_on_the_way: boolean | null;
  route_deviation_min: string | null;
  straight_distance_km: string | null;
  route_distance_km: string | null;
  eta_minutes: string | null;
  eta_confidence: string | null;
  provider_heading_deg: string | null;
  offer_status: string | null;
  price_ils: string | null;
  response_seconds: string | null;
  accepted: boolean;
  rejected: boolean;
  expired: boolean;
}

interface DebugData {
  job: {
    id: string; status: string; raw_description: string;
    understanding: Record<string, unknown>;
    dispatch_wave: number; dispatch_radius_km: string | null;
    category_name: string | null; service_name: string | null;
    base_price_ils: string | null;
  } | null;
  candidates: Candidate[];
}

const SIGNALS: { key: keyof Candidate; label: string; weightKey: string }[] = [
  { key: 'route_opportunity_score', label: 'Route Opportunity', weightKey: 'routeOpportunity' },
  { key: 'skill_score', label: 'Skill Match', weightKey: 'skillMatch' },
  { key: 'availability_score', label: 'Availability', weightKey: 'availability' },
  { key: 'eta_score', label: 'ETA', weightKey: 'eta' },
  { key: 'reliability_score', label: 'Reliability', weightKey: 'reliability' },
  { key: 'rating_score', label: 'Rating', weightKey: 'rating' },
  { key: 'price_score', label: 'Price', weightKey: 'price' },
  { key: 'experience_score', label: 'Experience', weightKey: 'experience' },
];

const EXCLUSION_LABEL: Record<string, string> = {
  location_stale: 'מיקום לא עדכני',
  location_inaccurate: 'מיקום לא מדויק דיו',
  outside_provider_radius: 'מחוץ לרדיוס שהמקצוען הגדיר',
  provider_state_offline: 'לא מקוון',
  provider_state_busy: 'בעבודה אחרת',
  below_cut: 'מתחת לרף ההצעה',
};

/**
 * MATCHING DEBUGGER (spec §34).
 *
 * Shows the recorded decision, signal by signal, with the weights that were
 * in force at dispatch time. Internal only — customers never see raw scores.
 */
export function MatchingDebugger({ jobId }: { jobId: string }) {
  const [data, setData] = useState<DebugData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const fresh = await apiFetch<DebugData>(`/api/admin/jobs/${jobId}/matching`).catch(
        (caught: unknown) => {
          if (active) {
            setError(caught instanceof ApiRequestError ? caught.message : 'טעינה נכשלה');
          }
          return null;
        },
      );
      if (!active) return;
      if (fresh) setData(fresh);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [jobId]);

  if (loading) return <LoadingState label="טוען ניתוח התאמה…" />;
  if (error && !data) return <ErrorState message={error} />;
  if (!data?.job) return <ErrorState message="העבודה לא נמצאה" />;

  const scored = data.candidates.filter((c) => c.excluded_reason === null);
  const excluded = data.candidates.filter((c) => c.excluded_reason !== null);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">ניתוח התאמה</h1>
          <p className="tech-id mt-1 text-xs text-ink-3">{data.job.id}</p>
        </div>
        <Link href="/admin">
          <Button variant="secondary" size="md">
            חזרה למרכז הבקרה
          </Button>
        </Link>
      </header>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">{data.job.status}</Badge>
          {data.job.category_name && <Badge>{data.job.category_name}</Badge>}
          {data.job.service_name && <Badge>{data.job.service_name}</Badge>}
          <Badge tone="neutral">
            סבב <span className="ltr-nums" dir="ltr">{data.job.dispatch_wave}</span>
            {data.job.dispatch_radius_km && (
              <>
                {' · '}
                <span className="ltr-nums" dir="ltr">
                  {Number(data.job.dispatch_radius_km)} km
                </span>
              </>
            )}
          </Badge>
        </div>
        <p className="mt-3 text-ink">{data.job.raw_description}</p>
        {data.job.base_price_ils && (
          <p className="mt-2 text-sm text-ink-2">
            מחיר ייחוס: <Money shekels={Number(data.job.base_price_ils)} />
          </p>
        )}
      </Card>

      {/* ── Score breakdown per candidate ─────────────────────────────── */}
      {scored.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-2">לא דורגו מועמדים עבור העבודה הזו.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {scored.map((candidate, index) => {
            const weights = candidate.weights_used ?? {};
            return (
              <Card
                key={candidate.provider_id}
                className={candidate.accepted ? 'border-ok/50' : undefined}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="ltr-nums text-sm text-ink-3" dir="ltr">
                        #{index + 1}
                      </span>
                      <h2 className="text-lg font-bold text-ink">{candidate.full_name}</h2>
                      {candidate.is_on_the_way && <Badge tone="ok">כבר בדרך</Badge>}
                      {candidate.accepted && <Badge tone="ok">קיבל</Badge>}
                      {candidate.rejected && <Badge tone="bad">דחה</Badge>}
                      {candidate.expired && <Badge tone="warn">פג</Badge>}
                    </div>
                    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2">
                      <div>
                        <dt className="inline">אווירי: </dt>
                        <dd className="ltr-nums inline" dir="ltr">
                          {Number(candidate.straight_distance_km ?? 0).toFixed(2)} km
                        </dd>
                      </div>
                      <div>
                        <dt className="inline">כביש: </dt>
                        <dd className="ltr-nums inline" dir="ltr">
                          {Number(candidate.route_distance_km ?? 0).toFixed(2)} km
                        </dd>
                      </div>
                      <div>
                        <dt className="inline">סטייה: </dt>
                        <dd className="ltr-nums inline" dir="ltr">
                          {Number(candidate.route_deviation_min ?? 0).toFixed(1)} min
                        </dd>
                      </div>
                      <div>
                        <dt className="inline">ETA: </dt>
                        <dd className="ltr-nums inline" dir="ltr">
                          {candidate.eta_minutes ? Number(candidate.eta_minutes).toFixed(0) : '—'} min
                          {candidate.eta_confidence ? ` (${candidate.eta_confidence})` : ''}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline">כיוון: </dt>
                        <dd className="ltr-nums inline" dir="ltr">
                          {candidate.provider_heading_deg
                            ? `${Number(candidate.provider_heading_deg).toFixed(0)}°`
                            : 'לא דווח'}
                        </dd>
                      </div>
                      {candidate.response_seconds && (
                        <div>
                          <dt className="inline">תגובה: </dt>
                          <dd className="ltr-nums inline" dir="ltr">
                            {Number(candidate.response_seconds).toFixed(0)}s
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                  <div className="text-end">
                    <p className="text-xs text-ink-2">FINAL SCORE</p>
                    <p className="ltr-nums text-3xl font-black text-ink" dir="ltr">
                      {Number(candidate.final_score ?? 0).toFixed(1)}
                    </p>
                  </div>
                </div>

                <table className="mt-4 w-full text-sm">
                  <caption className="sr-only">פירוט ניקוד לפי אות</caption>
                  <thead>
                    <tr className="text-xs text-ink-2">
                      <th scope="col" className="p-1 text-start">אות</th>
                      <th scope="col" className="p-1 text-start">ניקוד</th>
                      <th scope="col" className="p-1 text-start">משקל</th>
                      <th scope="col" className="p-1 text-start">תרומה</th>
                      <th scope="col" className="w-1/3 p-1 text-start">יחסי</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SIGNALS.map((signal) => {
                      const score = Number(candidate[signal.key] ?? 0);
                      const weight = weights[signal.weightKey] ?? 0;
                      return (
                        <tr key={signal.label} className="border-t border-surface-2">
                          <th scope="row" className="p-1 text-start font-normal text-ink-2">
                            {signal.label}
                          </th>
                          <td className="ltr-nums p-1 font-semibold text-ink" dir="ltr">
                            {score.toFixed(0)}
                          </td>
                          <td className="ltr-nums p-1 text-ink-2" dir="ltr">
                            {(weight * 100).toFixed(0)}%
                          </td>
                          <td className="ltr-nums p-1 text-brand-bright" dir="ltr">
                            {(score * weight).toFixed(1)}
                          </td>
                          <td className="p-1">
                            <div
                              className="h-2 rounded-full bg-surface-2"
                              role="presentation"
                            >
                              <div
                                className="h-2 rounded-full bg-brand"
                                style={{ width: `${Math.min(100, score)}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Why candidates were dropped ───────────────────────────────── */}
      {excluded.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold text-ink-2">
            מועמדים שנפסלו ({excluded.length})
          </h2>
          <ul className="mt-3 divide-y divide-surface-2">
            {excluded.map((candidate) => (
              <li
                key={`${candidate.provider_id}-${candidate.wave}`}
                className="flex items-center justify-between py-2"
              >
                <span className="text-sm text-ink-2">{candidate.full_name}</span>
                <Badge tone="neutral">
                  {EXCLUSION_LABEL[candidate.excluded_reason ?? ''] ?? candidate.excluded_reason}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
