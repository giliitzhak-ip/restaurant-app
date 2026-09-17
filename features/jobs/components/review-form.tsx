'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/input';
import { RatingInput } from '@/components/ui/rating';
import { SuccessState } from '@/components/ui/states';
import { postJson } from '@/features/auth/lib/form';
import { useT } from '@/components/providers/i18n-provider';
import type { ReviewCriterion } from '@/types/database';

const CRITERIA: ReviewCriterion[] = ['professionalism', 'price', 'punctuality', 'service'];

export function ReviewForm({ jobId, onDone }: { jobId: string; onDone?: () => void }) {
  const t = useT();
  const [rating, setRating] = useState(0);
  const [criteria, setCriteria] = useState<Partial<Record<ReviewCriterion, number>>>({});
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (rating < 1) {
      setError('בחר דירוג כללי');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await postJson(`/api/jobs/${jobId}/review`, { rating, comment: comment.trim() || undefined, criteria });
      setDone(true);
      onDone?.();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t.errors.generic);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) return <SuccessState title={t.review.submitted} />;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold">{t.review.title}</h3>
        <p className="text-sm text-muted-foreground">{t.review.subtitle}</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t.review.overall}</p>
        <RatingInput value={rating} onChange={setRating} label={t.review.overall} />
      </div>

      <div className="space-y-3">
        {CRITERIA.map((criterion) => (
          <div key={criterion} className="flex items-center justify-between gap-4">
            <span className="text-sm">{t.review.criteria[criterion]}</span>
            <RatingInput
              size="sm"
              value={criteria[criterion] ?? 0}
              onChange={(value) => setCriteria((current) => ({ ...current, [criterion]: value }))}
              label={t.review.criteria[criterion]}
            />
          </div>
        ))}
      </div>

      <Field label={t.review.comment} htmlFor="comment">
        <Textarea
          id="comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder={t.review.commentPlaceholder}
          rows={4}
          maxLength={2000}
        />
      </Field>

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <Button onClick={submit} loading={submitting} size="full" variant="success">
        {t.review.submit}
      </Button>
    </div>
  );
}
