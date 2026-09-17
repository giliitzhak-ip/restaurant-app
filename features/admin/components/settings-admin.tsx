'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { ErrorState, SkeletonList } from '@/components/ui/states';
import { useApi } from '@/hooks/use-api';
import { patchJson } from '@/features/auth/lib/form';
import { useT } from '@/components/providers/i18n-provider';
import { formatPercent } from '@/lib/utils/format';
import type {
  MatchWeights,
  MatchingSettings,
  PlatformFeeRules,
  TimeoutSettings,
  CancellationSettings,
} from '@/lib/services/settings/schema';

interface SettingsPayload {
  settings: {
    platform_fee_rules: PlatformFeeRules;
    match_weights: MatchWeights;
    matching: MatchingSettings;
    timeouts: TimeoutSettings;
    cancellation: CancellationSettings;
  };
}

const WEIGHT_LABELS: Record<keyof MatchWeights, string> = {
  distance: 'מרחק',
  rating: 'דירוג',
  availability: 'זמינות',
  category_match: 'התאמת מקצוע',
  response_speed: 'מהירות תגובה',
  completed_jobs: 'עבודות שהושלמו',
};

/**
 * Platform settings.
 *
 * Everything the brief calls "configurable" lives here — commission tiers,
 * match weights, radius steps, timeouts, cancellation policy — and nothing is
 * duplicated in code. Values are validated server-side before they are stored.
 */
export function SettingsAdmin() {
  const t = useT();
  const { data, loading, error, reload } = useApi<SettingsPayload>('/api/admin/settings');

  /**
   * Local edits are held as drafts that start empty and fall back to whatever
   * the server last returned. No effect copies fetched data into state, so a
   * background refresh can never clobber something the admin is mid-edit.
   */
  const [weightsDraft, setWeights] = useState<MatchWeights | null>(null);
  const [feesDraft, setFees] = useState<PlatformFeeRules | null>(null);
  const [matchingDraft, setMatching] = useState<MatchingSettings | null>(null);
  const [timeoutsDraft, setTimeouts] = useState<TimeoutSettings | null>(null);
  const [cancellationDraft, setCancellation] = useState<CancellationSettings | null>(null);

  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const weights = weightsDraft ?? data?.settings.match_weights ?? null;
  const fees = feesDraft ?? data?.settings.platform_fee_rules ?? null;
  const matching = matchingDraft ?? data?.settings.matching ?? null;
  const timeouts = timeoutsDraft ?? data?.settings.timeouts ?? null;
  const cancellation = cancellationDraft ?? data?.settings.cancellation ?? null;

  async function save(key: string, value: unknown) {
    setSaving(key);
    setMessage(null);
    try {
      await patchJson('/api/admin/settings', { key, value });
      setMessage({ kind: 'ok', text: t.common.saved });
      // Drop the draft so the freshly persisted server value takes over.
      clearDraft(key);
      await reload();
    } catch (saveError) {
      setMessage({
        kind: 'error',
        text: saveError instanceof Error ? saveError.message : t.errors.generic,
      });
    } finally {
      setSaving(null);
    }
  }

  function clearDraft(key: string) {
    if (key === 'platform_fee_rules') setFees(null);
    if (key === 'match_weights') setWeights(null);
    if (key === 'matching') setMatching(null);
    if (key === 'timeouts') setTimeouts(null);
    if (key === 'cancellation') setCancellation(null);
  }

  if (loading && !data) return <SkeletonList rows={4} />;
  if (error) return <ErrorState description={error} onRetry={reload} />;
  if (!weights || !fees || !matching || !timeouts || !cancellation) return <SkeletonList rows={4} />;

  const weightTotal = Object.values(weights).reduce((sum, value) => sum + value, 0);
  const weightsValid = Math.abs(weightTotal - 1) < 0.001;

  return (
    <div className="space-y-5">
      {message ? (
        <p
          role="status"
          className={`rounded-lg p-3 text-sm font-medium ${
            message.kind === 'ok' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {/* Commission */}
      <Card>
        <CardHeader>
          <CardTitle>{t.admin.feeRules}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="עמלת ברירת מחדל" htmlFor="defaultPct" hint="0–0.5">
              <Input
                id="defaultPct"
                type="number"
                step="0.01"
                min={0}
                max={0.5}
                dir="ltr"
                value={fees.default_percentage}
                onChange={(event) =>
                  setFees({ ...fees, default_percentage: Number(event.target.value) })
                }
              />
            </Field>
            <Field label="עמלת מינימום (₪)" htmlFor="minFee">
              <Input
                id="minFee"
                type="number"
                min={0}
                dir="ltr"
                value={fees.minimum_fee}
                onChange={(event) => setFees({ ...fees, minimum_fee: Number(event.target.value) })}
              />
            </Field>
            <Field label="עמלת מקסימום (₪)" htmlFor="maxFee">
              <Input
                id="maxFee"
                type="number"
                min={0}
                dir="ltr"
                value={fees.maximum_fee ?? ''}
                onChange={(event) =>
                  setFees({
                    ...fees,
                    maximum_fee: event.target.value ? Number(event.target.value) : null,
                  })
                }
              />
            </Field>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">מדרגות לפי סכום העבודה</p>
            {fees.tiers.map((tier, index) => (
              <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-4">
                <Field label="תיאור" htmlFor={`tier-label-${index}`}>
                  <Input
                    id={`tier-label-${index}`}
                    value={tier.label}
                    onChange={(event) => {
                      const tiers = [...fees.tiers];
                      tiers[index] = { ...tier, label: event.target.value };
                      setFees({ ...fees, tiers });
                    }}
                  />
                </Field>
                <Field label="מ-(₪)" htmlFor={`tier-min-${index}`}>
                  <Input
                    id={`tier-min-${index}`}
                    type="number"
                    dir="ltr"
                    value={tier.min_amount}
                    onChange={(event) => {
                      const tiers = [...fees.tiers];
                      tiers[index] = { ...tier, min_amount: Number(event.target.value) };
                      setFees({ ...fees, tiers });
                    }}
                  />
                </Field>
                <Field label="עד (₪)" htmlFor={`tier-max-${index}`}>
                  <Input
                    id={`tier-max-${index}`}
                    type="number"
                    dir="ltr"
                    value={tier.max_amount ?? ''}
                    onChange={(event) => {
                      const tiers = [...fees.tiers];
                      tiers[index] = {
                        ...tier,
                        max_amount: event.target.value ? Number(event.target.value) : null,
                      };
                      setFees({ ...fees, tiers });
                    }}
                  />
                </Field>
                <Field label="אחוז" htmlFor={`tier-pct-${index}`}>
                  <Input
                    id={`tier-pct-${index}`}
                    type="number"
                    step="0.01"
                    dir="ltr"
                    value={tier.percentage}
                    onChange={(event) => {
                      const tiers = [...fees.tiers];
                      tiers[index] = { ...tier, percentage: Number(event.target.value) };
                      setFees({ ...fees, tiers });
                    }}
                  />
                </Field>
              </div>
            ))}
          </div>

          <Button
            loading={saving === 'platform_fee_rules'}
            onClick={() => save('platform_fee_rules', fees)}
          >
            {t.admin.saveSettings}
          </Button>
        </CardContent>
      </Card>

      {/* Match weights */}
      <Card>
        <CardHeader>
          <CardTitle>{t.admin.matchWeights}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            המשקלים קובעים את דירוג ההתאמות. הם נשמרים בצד השרת ואינם נחשפים ללקוחות.
          </p>

          <div className="space-y-3">
            {(Object.keys(weights) as Array<keyof MatchWeights>).map((key) => (
              <div key={key} className="flex items-center gap-3">
                <label htmlFor={`weight-${key}`} className="w-40 shrink-0 text-sm">
                  {WEIGHT_LABELS[key]}
                </label>
                <input
                  id={`weight-${key}`}
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={weights[key]}
                  onChange={(event) => setWeights({ ...weights, [key]: Number(event.target.value) })}
                  className="flex-1 accent-[hsl(var(--accent))]"
                />
                <span className="num w-14 text-end text-sm font-medium">
                  {formatPercent(weights[key])}
                </span>
              </div>
            ))}
          </div>

          <p className={`text-sm font-medium ${weightsValid ? 'text-success' : 'text-destructive'}`}>
            {t.common.total}: <span className="num">{formatPercent(weightTotal)}</span>
            {weightsValid ? '' : ` — ${t.admin.weightsMustSum}`}
          </p>

          <Button
            loading={saving === 'match_weights'}
            disabled={!weightsValid}
            onClick={() => save('match_weights', weights)}
          >
            {t.admin.saveSettings}
          </Button>
        </CardContent>
      </Card>

      {/* Matching */}
      <Card>
        <CardHeader>
          <CardTitle>{t.admin.matching}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="שלבי רדיוס (ק״מ)" htmlFor="radiusSteps" hint="מופרד בפסיקים">
              <Input
                id="radiusSteps"
                dir="ltr"
                value={matching.radius_steps_km.join(', ')}
                onChange={(event) =>
                  setMatching({
                    ...matching,
                    radius_steps_km: event.target.value
                      .split(',')
                      .map((value) => Number(value.trim()))
                      .filter((value) => Number.isFinite(value) && value > 0),
                  })
                }
              />
            </Field>
            <Field label="מינימום בעלי מקצוע" htmlFor="minProviders">
              <Input
                id="minProviders"
                type="number"
                min={1}
                dir="ltr"
                value={matching.minimum_providers}
                onChange={(event) =>
                  setMatching({ ...matching, minimum_providers: Number(event.target.value) })
                }
              />
            </Field>
            <Field label="מקסימום לעבודה" htmlFor="maxProviders">
              <Input
                id="maxProviders"
                type="number"
                min={1}
                max={50}
                dir="ltr"
                value={matching.max_providers_per_job}
                onChange={(event) =>
                  setMatching({ ...matching, max_providers_per_job: Number(event.target.value) })
                }
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={matching.prefer_favorites}
              onChange={(event) => setMatching({ ...matching, prefer_favorites: event.target.checked })}
              className="size-4 rounded border-input"
            />
            עדיפות לבעלי מקצוע מועדפים
          </label>

          <Button loading={saving === 'matching'} onClick={() => save('matching', matching)}>
            {t.admin.saveSettings}
          </Button>
        </CardContent>
      </Card>

      {/* Timeouts & cancellation */}
      <Card>
        <CardHeader>
          <CardTitle>זמנים ומדיניות ביטול</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="חלון חיפוש (דק׳)" htmlFor="searchMinutes">
              <Input
                id="searchMinutes"
                type="number"
                min={1}
                dir="ltr"
                value={timeouts.job_search_minutes}
                onChange={(event) =>
                  setTimeouts({ ...timeouts, job_search_minutes: Number(event.target.value) })
                }
              />
            </Field>
            <Field label="תגובת בעל מקצוע (דק׳)" htmlFor="responseMinutes">
              <Input
                id="responseMinutes"
                type="number"
                min={1}
                dir="ltr"
                value={timeouts.provider_response_minutes}
                onChange={(event) =>
                  setTimeouts({ ...timeouts, provider_response_minutes: Number(event.target.value) })
                }
              />
            </Field>
            <Field label="תוקף הצעה (דק׳)" htmlFor="offerMinutes">
              <Input
                id="offerMinutes"
                type="number"
                min={5}
                dir="ltr"
                value={timeouts.offer_validity_minutes}
                onChange={(event) =>
                  setTimeouts({ ...timeouts, offer_validity_minutes: Number(event.target.value) })
                }
              />
            </Field>
          </div>

          <Button loading={saving === 'timeouts'} onClick={() => save('timeouts', timeouts)}>
            {t.admin.saveSettings}
          </Button>

          <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
            <Field label="חלון ביטול חופשי (דק׳)" htmlFor="freeWindow">
              <Input
                id="freeWindow"
                type="number"
                min={0}
                dir="ltr"
                value={cancellation.free_window_minutes}
                onChange={(event) =>
                  setCancellation({ ...cancellation, free_window_minutes: Number(event.target.value) })
                }
              />
            </Field>
            <Field label="דמי ביטול ללקוח" htmlFor="cancelPct" hint="0–0.5">
              <Input
                id="cancelPct"
                type="number"
                step="0.01"
                min={0}
                max={0.5}
                dir="ltr"
                value={cancellation.customer_fee_percentage}
                onChange={(event) =>
                  setCancellation({
                    ...cancellation,
                    customer_fee_percentage: Number(event.target.value),
                  })
                }
              />
            </Field>
          </div>

          <Button loading={saving === 'cancellation'} onClick={() => save('cancellation', cancellation)}>
            {t.admin.saveSettings}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
