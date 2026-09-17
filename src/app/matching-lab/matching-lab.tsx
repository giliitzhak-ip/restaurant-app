'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, Card, ErrorState, Field, inputClasses, Spinner } from '@/components/ui';
import { Logo } from '@/components/brand';
import { apiFetch, ApiRequestError } from '@/lib/client/api';

interface LabProvider {
  id: string;
  name: string;
  lat: number;
  lon: number;
  headingDeg: number | null;
  destinationLat: number | null;
  destinationLon: number | null;
  priceIls: number;
  ratingAvg: number;
  ratingCount: number;
  completedJobs: number;
  yearsExperience: number;
  state: 'ONLINE' | 'OFFLINE' | 'BUSY';
  locationAgeSeconds: number;
}

interface LabResult {
  mapProvider: string;
  weightsUsed: Record<string, number>;
  ranked: {
    rank: number;
    providerId: string;
    name: string;
    finalScore: number;
    etaMinutes: number | null;
    etaConfidence: string;
    routeDistanceKm: number;
    straightDistanceKm: number;
    priceIls: number;
    routeOpportunity: {
      isOnTheWay: boolean;
      routeDeviationMinutes: number;
      opportunityScore: number;
      basis: string;
      headingOffsetDeg: number | null;
    };
    breakdown: Record<string, { score: number; weight: number; weighted: number; reason: string }>;
  }[];
  excluded: { providerId: string; name: string; reason: string }[];
}

const CUSTOMER = { lat: 32.0742, lon: 34.7749 };

/**
 * The default scenario is the one that decides whether the product works:
 * a CLOSER provider driving away versus a FURTHER provider already heading
 * toward the customer. A distance-only matcher ranks "דן" first. GET SERVICE
 * must rank "רם" first.
 */
const DEFAULT_PROVIDERS: LabProvider[] = [
  {
    id: 'ram', name: 'רם — 3.2 ק"מ, נוסע לכיוון הלקוח',
    lat: 32.103, lon: 34.7749, headingDeg: 180,
    destinationLat: 32.056, destinationLon: 34.7749,
    priceIls: 300, ratingAvg: 4.6, ratingCount: 80, completedJobs: 120,
    yearsExperience: 8, state: 'ONLINE', locationAgeSeconds: 15,
  },
  {
    id: 'dan', name: 'דן — 1.0 ק"מ, נוסע בכיוון ההפוך',
    lat: 32.0832, lon: 34.7749, headingDeg: 0,
    destinationLat: 32.21, destinationLon: 34.79,
    priceIls: 240, ratingAvg: 5.0, ratingCount: 400, completedJobs: 500,
    yearsExperience: 15, state: 'ONLINE', locationAgeSeconds: 15,
  },
  {
    id: 'yossi', name: 'יוסי — 0.8 ק"מ, ללא נתוני כיוון',
    lat: 32.069, lon: 34.781, headingDeg: null,
    destinationLat: null, destinationLon: null,
    priceIls: 296, ratingAvg: 4.9, ratingCount: 341, completedJobs: 402,
    yearsExperience: 14, state: 'ONLINE', locationAgeSeconds: 20,
  },
  {
    id: 'stale', name: 'אלי — קרוב אבל מיקום ישן (30 דק׳)',
    lat: 32.076, lon: 34.775, headingDeg: 200,
    destinationLat: 32.07, destinationLon: 34.774,
    priceIls: 280, ratingAvg: 4.8, ratingCount: 120, completedJobs: 200,
    yearsExperience: 10, state: 'ONLINE', locationAgeSeconds: 1800,
  },
];

export function MatchingLab() {
  const [providers, setProviders] = useState<LabProvider[]>(DEFAULT_PROVIDERS);
  const [result, setResult] = useState<LabResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const update = (index: number, patch: Partial<LabProvider>) => {
    setProviders((current) =>
      current.map((provider, i) => (i === index ? { ...provider, ...patch } : provider)),
    );
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch<LabResult>('/api/matching-lab', {
        method: 'POST',
        json: {
          customer: CUSTOMER,
          requiredSkills: ['plumbing'],
          referencePriceIls: 290,
          urgency: 'high',
          providers: providers.map((p) => ({ ...p, skills: ['plumbing'] })),
        },
      });
      setResult(response);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'הסימולציה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const winner = result?.ranked[0];
  const thesisHolds = winner?.routeOpportunity.isOnTheWay === true;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Logo />
          <h1 className="text-xl font-bold text-white">מעבדת התאמה</h1>
        </div>
        <Link href="/admin">
          <Button variant="secondary" size="md">
            מרכז בקרה
          </Button>
        </Link>
      </header>

      <Card className="border-accent-500/30">
        <h2 className="text-sm font-semibold text-accent-400">מה בודקים כאן</h2>
        <p className="mt-2 text-sm text-slate-300">
          המעבדה מריצה את מנוע ההתאמה האמיתי — אותו קוד שמשגר עבודות בפועל —
          על מקצוענים היפותטיים. אין כתיבה לבסיס הנתונים ואין שיגור הצעות.
        </p>
        <p className="mt-2 text-sm text-slate-400">
          התרחיש שנטען כברירת מחדל הוא המקרה המכריע: מקצוען <strong>קרוב יותר</strong>{' '}
          שנוסע בכיוון ההפוך, מול מקצוען <strong>רחוק יותר</strong> שכבר נוסע לכיוון
          הלקוח. מנוע שמתבסס על מרחק בלבד יבחר את דן. GET SERVICE צריך לבחור את רם.
        </p>
      </Card>

      {/* ── Editable scenario ─────────────────────────────────────────── */}
      <Card>
        <h2 className="text-sm font-semibold text-slate-300">
          מקצוענים בסימולציה (לקוח:{' '}
          <span className="ltr-nums" dir="ltr">
            {CUSTOMER.lat}, {CUSTOMER.lon}
          </span>
          )
        </h2>

        <div className="mt-4 space-y-4">
          {providers.map((provider, index) => (
            <div key={provider.id} className="rounded-xl border border-navy-700 bg-navy-950 p-4">
              <p className="font-semibold text-white">{provider.name}</p>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Field label="כיוון נסיעה (°)" htmlFor={`h-${provider.id}`}>
                  <input
                    id={`h-${provider.id}`}
                    type="number"
                    dir="ltr"
                    min={0}
                    max={359}
                    className={inputClasses}
                    value={provider.headingDeg ?? ''}
                    placeholder="לא דווח"
                    onChange={(e) =>
                      update(index, {
                        headingDeg: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="מחיר (₪)" htmlFor={`p-${provider.id}`}>
                  <input
                    id={`p-${provider.id}`}
                    type="number"
                    dir="ltr"
                    min={0}
                    className={inputClasses}
                    value={provider.priceIls}
                    onChange={(e) => update(index, { priceIls: Number(e.target.value) })}
                  />
                </Field>
                <Field label="דירוג" htmlFor={`r-${provider.id}`}>
                  <input
                    id={`r-${provider.id}`}
                    type="number"
                    dir="ltr"
                    min={1}
                    max={5}
                    step={0.1}
                    className={inputClasses}
                    value={provider.ratingAvg}
                    onChange={(e) => update(index, { ratingAvg: Number(e.target.value) })}
                  />
                </Field>
                <Field label="גיל מיקום (שנ׳)" htmlFor={`a-${provider.id}`}>
                  <input
                    id={`a-${provider.id}`}
                    type="number"
                    dir="ltr"
                    min={0}
                    className={inputClasses}
                    value={provider.locationAgeSeconds}
                    onChange={(e) => update(index, { locationAgeSeconds: Number(e.target.value) })}
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>

        <Button className="mt-5" loading={busy} onClick={run}>
          הרץ סימולציה
        </Button>
      </Card>

      {error && <ErrorState message={error} onRetry={run} />}

      {busy && !result && (
        <Card>
          <p className="flex items-center gap-2 text-slate-300">
            <Spinner className="size-5" /> מריץ…
          </p>
        </Card>
      )}

      {/* ── Results ──────────────────────────────────────────────────── */}
      {result && (
        <>
          <Card className={thesisHolds ? 'border-success-500/50' : 'border-danger-500/50'}>
            <h2 className="text-sm font-semibold text-slate-300">תוצאה</h2>
            <p className="mt-2 text-lg font-bold text-white">
              {winner ? `הנבחר: ${winner.name}` : 'לא נמצא מועמד כשיר'}
            </p>
            {winner && (
              <p className={`mt-2 text-sm ${thesisHolds ? 'text-success-400' : 'text-danger-400'}`}>
                {thesisHolds
                  ? '✓ המנוע בחר מקצוען שכבר בדרך — התזה מתקיימת.'
                  : '✗ המנוע לא בחר מקצוען שבדרך — יש לבדוק את הכיול.'}
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500">
              מנוע מסלולים: {result.mapProvider}. משקלים:{' '}
              {Object.entries(result.weightsUsed)
                .map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`)
                .join(' · ')}
            </p>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-slate-300">דירוג מועמדים</h2>
            <div className="mt-3 space-y-3">
              {result.ranked.map((entry) => (
                <div key={entry.providerId} className="rounded-xl border border-navy-700 bg-navy-950">
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded(expanded === entry.providerId ? null : entry.providerId)
                    }
                    aria-expanded={expanded === entry.providerId}
                    className="flex w-full items-center justify-between gap-3 p-4 text-start"
                  >
                    <div className="flex items-center gap-3">
                      <span className="ltr-nums text-lg font-black text-slate-500" dir="ltr">
                        #{entry.rank}
                      </span>
                      <div>
                        <p className="font-semibold text-white">{entry.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {entry.routeOpportunity.isOnTheWay && (
                            <Badge tone="success">כבר בדרך</Badge>
                          )}
                          <Badge tone="neutral">{entry.routeOpportunity.basis}</Badge>
                          <span className="ltr-nums text-xs text-slate-400" dir="ltr">
                            straight {entry.straightDistanceKm}km · road{' '}
                            {entry.routeDistanceKm}km · dev{' '}
                            {entry.routeOpportunity.routeDeviationMinutes}min
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="ltr-nums text-2xl font-black text-white" dir="ltr">
                      {entry.finalScore.toFixed(1)}
                    </span>
                  </button>

                  {expanded === entry.providerId && (
                    <div className="border-t border-navy-700 p-4">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-slate-400">
                            <th scope="col" className="p-1 text-start">אות</th>
                            <th scope="col" className="p-1 text-start">ניקוד</th>
                            <th scope="col" className="p-1 text-start">משקל</th>
                            <th scope="col" className="p-1 text-start">תרומה</th>
                            <th scope="col" className="p-1 text-start">הסבר</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(entry.breakdown).map(([key, component]) => (
                            <tr key={key} className="border-t border-navy-800">
                              <th scope="row" className="p-1 text-start font-normal text-slate-300">
                                {key}
                              </th>
                              <td className="ltr-nums p-1 font-semibold text-white" dir="ltr">
                                {component.score.toFixed(0)}
                              </td>
                              <td className="ltr-nums p-1 text-slate-400" dir="ltr">
                                {(component.weight * 100).toFixed(0)}%
                              </td>
                              <td className="ltr-nums p-1 text-accent-400" dir="ltr">
                                {component.weighted.toFixed(1)}
                              </td>
                              <td className="p-1 text-xs text-slate-400">{component.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {result.excluded.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-slate-400">נפסלו</h3>
                <ul className="mt-2 space-y-1">
                  {result.excluded.map((entry) => (
                    <li key={entry.providerId} className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{entry.name}</span>
                      <Badge tone="danger">{entry.reason}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
