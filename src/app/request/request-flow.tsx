'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Field, inputClasses, Money, Spinner } from '@/components/ui';
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

const URGENCY_LABEL: Record<Understanding['urgency'], { text: string; tone: 'neutral' | 'warn' | 'bad' }> = {
  low: { text: 'לא דחוף', tone: 'neutral' },
  normal: { text: 'רגיל', tone: 'neutral' },
  high: { text: 'דחוף', tone: 'warn' },
  emergency: { text: 'חירום', tone: 'bad' },
};

export function RequestFlow({
  initialDescription,
  bookingMode,
  categoryHint,
  // Computed by the server component. Deriving it from Date.now() during
  // render would be impure and would disagree between server and client;
  // the server also revalidates the chosen time on submit.
  minScheduleValue,
}: {
  initialDescription: string;
  bookingMode: 'NOW' | 'SCHEDULE' | 'COMPARE';
  categoryHint: string | null;
  minScheduleValue: string;
}) {
  const router = useRouter();
  const geo = useGeolocation();
  const requestLocation = geo.request;

  const [description, setDescription] = useState(initialDescription);
  const [understanding, setUnderstanding] = useState<UnderstandResponse | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [addressText, setAddressText] = useState('');
  const [addressNotes, setAddressNotes] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
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
      // Classification is a convenience; the server re-runs it on submit.
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
    (hasLocation || addressText.trim().length > 3) &&
    (bookingMode !== 'SCHEDULE' || scheduledFor.length > 0) &&
    !submitting;

  const submit = async () => {
    setError(null);

    if (!geo.fix && addressText.trim().length <= 3) {
      setError('נדרש מיקום או כתובת כדי לשלוח מקצוען.');
      return;
    }
    // No location is ever invented: without a fix we still require the
    // customer to type an address, and we do not fabricate coordinates
    // (spec §44). A text-only address is accepted but flagged for the
    // provider, since matching quality depends on a real fix.
    if (!geo.fix) {
      setError(
        'לא הצלחנו לאתר את המיקום המדויק. אשרו גישה למיקום — בלי מיקום לא נוכל לחשב זמן הגעה אמיתי.',
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
          bookingMode,
          scheduledFor: bookingMode === 'SCHEDULE' ? new Date(scheduledFor).toISOString() : undefined,
          categorySlug: categoryHint ?? undefined,
        },
      });
      router.replace(`/jobs/${job.id}`);
    } catch (caught) {
      if (caught instanceof ApiRequestError) {
        setError(caught.message);
      } else {
        setError('לא הצלחנו לפתוח את הקריאה. נסו שוב.');
      }
      setSubmitting(false);
    }
  };

  const modeLabel =
    bookingMode === 'NOW' ? 'עכשיו' : bookingMode === 'SCHEDULE' ? 'למועד אחר' : 'קבלת הצעות';

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <Logo />
        <Badge tone="brand">{modeLabel}</Badge>
      </header>

      <Card>
        <Field label="מה קרה?" htmlFor="description">
          <textarea
            id="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={() => void classify(description)}
            rows={3}
            maxLength={2000}
            className={`${inputClasses} resize-none`}
          />
        </Field>

        {/* What we understood, shown before committing, and correctable. */}
        <div className="mt-4 min-h-14 rounded-xl border border-line bg-bg p-3">
          {classifying ? (
            <p className="flex items-center gap-2 text-sm text-ink-2">
              <Spinner className="size-4" /> מזהים את סוג התקלה…
            </p>
          ) : understanding?.understanding.category ? (
            <div className="space-y-2">
              <p className="text-sm text-ink-2">זיהינו:</p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brand">{understanding.categoryName}</Badge>
                {understanding.serviceName && <Badge>{understanding.serviceName}</Badge>}
                <Badge tone={URGENCY_LABEL[understanding.understanding.urgency].tone}>
                  {URGENCY_LABEL[understanding.understanding.urgency].text}
                </Badge>
              </div>
              {understanding.guidePriceIls !== null && (
                <p className="text-sm text-ink-2">
                  טווח מחירים מוערך: <Money shekels={understanding.guidePriceIls} />
                  <span className="text-ink-3"> — המחיר הסופי יוצג לפני האישור</span>
                </p>
              )}
              {understanding.understanding.clarifyingQuestion && (
                <p className="text-sm text-warn-bright">
                  {understanding.understanding.clarifyingQuestion}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-ink-2">
              {description.trim().length < 3
                ? 'כתבו כמה מילים כדי שנזהה את סוג התקלה.'
                : 'לא זיהינו את סוג התקלה — נמשיך בכל זאת ונבקש פרטים.'}
            </p>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-ink">איפה?</h2>

        {geo.status === 'requesting' && (
          <p className="mt-3 flex items-center gap-2 text-sm text-ink-2">
            <Spinner className="size-4" /> מאתרים את המיקום…
          </p>
        )}

        {geo.fix && (
          <p className="mt-3 flex items-center gap-2 text-sm text-ok-bright">
            <span aria-hidden="true">📍</span>
            מיקום אותר
            {geo.fix.accuracyM !== null && (
              <span className="ltr-nums text-ink-2" dir="ltr">
                (±{Math.round(geo.fix.accuracyM)}m)
              </span>
            )}
          </p>
        )}

        {geo.message && (
          <div className="mt-3 rounded-xl bg-warn/10 px-4 py-3">
            <p className="text-sm text-warn-bright">{geo.message}</p>
            <Button variant="secondary" size="md" className="mt-3" onClick={() => void geo.request()}>
              נסו לאתר שוב
            </Button>
          </div>
        )}

        <div className="mt-4 space-y-4">
          <Field label="כתובת" htmlFor="address" hint="קומה, דירה, קוד כניסה — יעזור למקצוען להגיע">
            <input
              id="address"
              className={inputClasses}
              value={addressText}
              onChange={(event) => setAddressText(event.target.value)}
              placeholder="רחוב ומספר"
              autoComplete="street-address"
            />
          </Field>
          <Field label="הערות לכניסה" htmlFor="notes">
            <input
              id="notes"
              className={inputClasses}
              value={addressNotes}
              onChange={(event) => setAddressNotes(event.target.value)}
              placeholder="קומה 3, דירה 12, קוד 1234"
            />
          </Field>
        </div>
      </Card>

      {bookingMode === 'SCHEDULE' && (
        <Card>
          <Field label="מתי?" htmlFor="when">
            <input
              id="when"
              type="datetime-local"
              dir="ltr"
              className={inputClasses}
              value={scheduledFor}
              min={minScheduleValue || undefined}
              onChange={(event) => setScheduledFor(event.target.value)}
            />
          </Field>
        </Card>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-bad/10 px-4 py-3 text-sm text-bad-bright">
          {error}
        </p>
      )}

      <Button size="xl" fullWidth loading={submitting} disabled={!canSubmit} onClick={submit}>
        {bookingMode === 'NOW' ? 'מצאו לי מקצוען' : 'שלחו בקשה'}
      </Button>
      <p className="text-center text-xs text-ink-3">
        לא תחויבו עד שתאשרו את המקצוען והמחיר.
      </p>
    </div>
  );
}
