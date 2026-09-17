'use client';

import { useState } from 'react';
import { Button, Card, Field, inputClasses } from '@/components/ui';
import { apiFetch, ApiRequestError } from '@/lib/client/api';

/** Customer → provider review (spec §30). */
export function ReviewPanel({
  jobId,
  providerName,
  alreadyReviewed,
  onChanged,
}: {
  jobId: string;
  providerName: string;
  alreadyReviewed: boolean;
  onChanged: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(alreadyReviewed);

  if (done) {
    return (
      <Card className="border-success-500/40 text-center">
        <p className="font-semibold text-success-400">תודה על הדירוג</p>
        <p className="mt-1 text-sm text-slate-400">הדירוג עוזר ללקוחות הבאים.</p>
      </Card>
    );
  }

  const submit = async () => {
    if (rating === 0) {
      setError('בחרו דירוג בין 1 ל-5');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/jobs/${jobId}/review`, {
        method: 'POST',
        json: { rating, comment: comment.trim() || undefined },
      });
      setDone(true);
      onChanged();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'לא הצלחנו לשמור את הדירוג');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2 className="text-lg font-bold text-white">איך היה עם {providerName}?</h2>

      <fieldset className="mt-4">
        <legend className="sr-only">דירוג מ-1 עד 5 כוכבים</legend>
        <div className="flex justify-center gap-2" dir="ltr">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              aria-label={`${value} כוכבים`}
              aria-pressed={rating === value}
              className={`size-12 rounded-xl text-2xl transition-colors ${
                value <= rating ? 'bg-warning-500/20 text-warning-400' : 'bg-navy-800 text-slate-600'
              }`}
            >
              ★
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-4">
        <Field label="משהו להוסיף? (אופציונלי)" htmlFor="comment">
          <textarea
            id="comment"
            rows={3}
            maxLength={2000}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            className={`${inputClasses} resize-none`}
          />
        </Field>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger-400">
          {error}
        </p>
      )}

      <Button fullWidth className="mt-4" loading={busy} onClick={submit}>
        שלחו דירוג
      </Button>
    </Card>
  );
}
