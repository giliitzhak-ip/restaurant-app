'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Inset,
  Money,
  SectionLabel,
  Segmented,
  Spinner,
  inputClasses,
} from '@/components/ui';
import { Logo } from '@/components/brand';
import { apiFetch, ApiRequestError } from '@/lib/client/api';
import { useGeolocation } from '@/lib/client/use-geolocation';

interface Understanding {
  category: string | null;
  service: string | null;
  urgency: 'low' | 'normal' | 'high' | 'emergency';
  confidence: number;
  signals: string[];
  clarifyingQuestion: string | null;
}

interface UnderstandResponse {
  understanding: Understanding;
  categoryName: string | null;
  serviceName: string | null;
  guidePriceIls: number | null;
}

interface CreateJobResponse {
  id: string;
  status: string;
}

type Timing = 'NOW' | 'ASAP' | 'SCHEDULED';

const URGENCY_LABEL: Record<Understanding['urgency'], { text: string; tone: 'neutral' | 'warn' | 'bad' }> = {
  low: { text: 'לא דחוף', tone: 'neutral' },
  normal: { text: 'רגיל', tone: 'neutral' },
  high: { text: 'דחוף', tone: 'warn' },
  emergency: { text: 'חירום', tone: 'bad' },
};

const TIMING_OPTIONS = [
  { value: 'NOW' as const, label: 'עכשיו', hint: 'מיד' },
  { value: 'ASAP' as const, label: 'היום', hint: 'בהקדם' },
  { value: 'SCHEDULED' as const, label: 'בתאריך', hint: 'אני אבחר' },
];

/**
 * Confirm and send (spec §8, §18).
 *
 * The description and the timing arrive from the home screen and are shown
 * as ANSWERS, not as empty fields to fill in again. Both stay editable,
 * because the cost of being stuck with a wrong classification is much higher
 * than the cost of a "שינוי" link. What is genuinely still missing is the
 * location, so that is what this screen is mostly about.
 */
export function RequestFlow({
  initialDescription,
  initialTiming,
  initialRequestedFor,
  minScheduleValue,
}: {
  initialDescription: string;
  initialTiming: Timing;
  initialRequestedFor: string;
  minScheduleValue: string;
}) {
  const router = useRouter();
  const geo = useGeolocation();
  const requestLocation = geo.request;

  const [description, setDescription] = useState(initialDescription);
  const [editingWhat, setEditingWhat] = useState(initialDescription.trim().length < 3);
  const [timing, setTiming] = useState<Timing>(initialTiming);
  const [requestedFor, setRequestedFor] = useState(initialRequestedFor);
  const [understanding, setUnderstanding] = useState<UnderstandResponse | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [addressText, setAddressText] = useState('');
  const [addressNotes, setAddressNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const classify = useCallback(async (text: string) => {
    if (text.trim().length < 3) {
      setUnderstanding(null);
      return;
    }
    setClassifying(true);
    try {
      const result = await apiFetch<UnderstandResponse>('/api/understand', {
        method: 'POST',
        json: { text },
      });
      setUnderstanding(result);
    } catch {
      // Classification is a convenience; the server re-does it on submit.
      setUnderstanding(null);
    } finally {
      setClassifying(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const text = initialDescription.trim();
      if (text.length < 3) return;
      const result = await apiFetch<UnderstandResponse>('/api/understand', {
        method: 'POST',
        json: { text },
      }).catch(() => null);
      if (active && result) setUnderstanding(result);
    })();
    return () => {
      active = false;
    };
  }, [initialDescription]);

  // Ask for location immediately: it is the one thing we genuinely cannot
  // proceed without, so asking late wastes the customer's time. Deferred by
  // a tick so the permission prompt does not set state mid-commit.
  useEffect(() => {
    const timer = setTimeout(() => void requestLocation(), 0);
    return () => clearTimeout(timer);
  }, [requestLocation]);

  const hasLocation = geo.fix !== null;
  const canSubmit =
    description.trim().length >= 3 &&
    hasLocation &&
    (timing !== 'SCHEDULED' || requestedFor.length > 0) &&
    !submitting;

  const submit = async () => {
    setError(null);

    // No location is ever invented. Without a real fix we cannot compute a
    // true ETA or a real route opportunity, and a made-up one is worse than
    // an honest refusal (spec §44).
    if (!geo.fix) {
      setError(
        'לא הצלחנו לאתר את המיקום. אשרו גישה למיקום — בלעדיו לא נוכל לחשב זמן הגעה אמיתי.',
      );
      return;
    }

    setSubmitting(true);
    try {
      const job = await apiFetch<CreateJobResponse>('/api/jobs', {
        method: 'POST',
        json: {
          description: description.trim(),
          lat: geo.fix.lat,
          lon: geo.fix.lon,
          accuracyM: geo.fix.accuracyM,
          addressText: addressText.trim() || undefined,
          addressNotes: addressNotes.trim() || undefined,
          timing,
          requestedFor:
            timing === 'SCHEDULED' ? new Date(requestedFor).toISOString() : undefined,
        },
      });
      router.replace(`/jobs/${job.id}`);
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : 'לא הצלחנו לפתוח את הקריאה. נסו שוב.',
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <Logo />
      </header>

      {/* ── What, as an answer ─────────────────────────────────────────── */}
      <section>
        <div className="mb-2.5 flex items-baseline justify-between gap-3">
          <SectionLabel>מה קרה</SectionLabel>
          {!editingWhat && (
            <button
              type="button"
              onClick={() => setEditingWhat(true)}
              className="min-h-11 rounded-lg px-2 text-[13px] font-semibold text-brand-bright hover:bg-surface-2"
            >
              שינוי
            </button>
          )}
        </div>

        {editingWhat ? (
          <>
            <label htmlFor="description" className="sr-only">
              מה קרה
            </label>
            <textarea
              id="description"
              value={description}
              autoFocus
              onChange={(event) => setDescription(event.target.value)}
              onBlur={() => {
                if (description.trim().length >= 3) setEditingWhat(false);
                void classify(description);
              }}
              rows={3}
              maxLength={2000}
              className={`${inputClasses} resize-none`}
            />
          </>
        ) : (
          <p className="text-[17px] leading-snug text-ink">{description}</p>
        )}

        {/* What we understood. Shown before committing, and correctable by
            editing the description — never presented as certain when it is
            not (spec §29). */}
        <div className="mt-3">
          {classifying ? (
            <p className="flex items-center gap-2 text-sm text-ink-2">
              <Spinner className="size-4" /> מזהים את סוג התקלה…
            </p>
          ) : understanding?.understanding.category ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brand">{understanding.categoryName}</Badge>
                {understanding.serviceName && <Badge>{understanding.serviceName}</Badge>}
                {understanding.understanding.urgency !== 'normal' && (
                  <Badge tone={URGENCY_LABEL[understanding.understanding.urgency].tone}>
                    {URGENCY_LABEL[understanding.understanding.urgency].text}
                  </Badge>
                )}
              </div>
              {understanding.guidePriceIls !== null && (
                <p className="text-[13px] text-ink-3">
                  מחיר מוערך <Money shekels={understanding.guidePriceIls} /> — המחיר הסופי
                  יוצג לאישורכם לפני שמישהו יוצא לדרך
                </p>
              )}
              {understanding.understanding.clarifyingQuestion && (
                <p className="text-[13px] text-warn-bright">
                  {understanding.understanding.clarifyingQuestion}
                </p>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-ink-3">
              {description.trim().length < 3
                ? 'כתבו כמה מילים כדי שנזהה את סוג התקלה.'
                : 'לא זיהינו את סוג התקלה — נמשיך בכל זאת ונבקש פרטים.'}
            </p>
          )}
        </div>
      </section>

      {/* ── When ───────────────────────────────────────────────────────── */}
      <section>
        <SectionLabel>מתי</SectionLabel>
        <Segmented options={TIMING_OPTIONS} value={timing} onChange={setTiming} label="מתי" />
        {timing === 'SCHEDULED' && (
          <div className="mt-2.5">
            <label htmlFor="when" className="sr-only">
              מועד מבוקש
            </label>
            <input
              id="when"
              type="datetime-local"
              dir="ltr"
              className={`${inputClasses} ltr-nums`}
              value={requestedFor}
              min={minScheduleValue || undefined}
              onChange={(event) => setRequestedFor(event.target.value)}
            />
          </div>
        )}
        <p className="mt-2 text-[13px] text-ink-3">
          {timing === 'NOW'
            ? 'נחפש מקצוען שזמין ברגע זה.'
            : timing === 'ASAP'
              ? 'נחפש את ההזדמנות הטובה ביותר להיום.'
              : 'נחפש מי שפנוי במועד שבחרתם.'}
        </p>
      </section>

      {/* ── Where ──────────────────────────────────────────────────────── */}
      <section>
        <SectionLabel>איפה</SectionLabel>
        <Card className="space-y-3">
          {geo.status === 'requesting' && (
            <p className="flex items-center gap-2 text-sm text-ink-2">
              <Spinner className="size-4" /> מאתרים את המיקום…
            </p>
          )}

          {geo.fix && (
            <p className="flex items-center gap-2 text-sm text-ok-bright">
              <span aria-hidden="true">📍</span>
              המיקום אותר
              {geo.fix.accuracyM !== null && (
                <span className="ltr-nums text-ink-3" dir="ltr">
                  ±{Math.round(geo.fix.accuracyM)}m
                </span>
              )}
            </p>
          )}

          {geo.message && (
            <Inset className="bg-warn/10">
              <p className="text-sm text-warn-bright">{geo.message}</p>
              <Button
                variant="secondary"
                size="md"
                className="mt-3"
                onClick={() => void geo.request()}
              >
                נסו לאתר שוב
              </Button>
            </Inset>
          )}

          {/* Street address is optional — the fix is what matching uses. The
              notes are what actually gets someone to the door. */}
          <label htmlFor="address" className="sr-only">
            כתובת
          </label>
          <input
            id="address"
            className={inputClasses}
            value={addressText}
            onChange={(event) => setAddressText(event.target.value)}
            placeholder="רחוב ומספר (לא חובה)"
            autoComplete="street-address"
          />
          <label htmlFor="notes" className="sr-only">
            הערות לכניסה
          </label>
          <input
            id="notes"
            className={inputClasses}
            value={addressNotes}
            onChange={(event) => setAddressNotes(event.target.value)}
            placeholder="קומה, דירה, קוד כניסה"
          />
        </Card>
      </section>

      {error && (
        <p role="alert" className="rounded-xl bg-bad/10 px-4 py-3 text-sm text-bad-bright">
          {error}
        </p>
      )}

      <div>
        <Button size="xl" fullWidth loading={submitting} disabled={!canSubmit} onClick={submit}>
          מצא לי מקצוען
        </Button>
        <p className="mt-2.5 text-center text-[13px] text-ink-3">
          {!hasLocation
            ? 'נדרש מיקום כדי להמשיך'
            : 'לא תחויבו עד שתאשרו את המקצוען והמחיר.'}
        </p>
      </div>
    </div>
  );
}
