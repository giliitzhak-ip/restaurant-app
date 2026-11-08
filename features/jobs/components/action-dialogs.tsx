'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { postJson } from '@/features/auth/lib/form';
import { useT } from '@/components/providers/i18n-provider';
import type { DisputeReason } from '@/types/database';

interface DialogProps {
  jobId: string;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function CancelJobDialog({ jobId, open, onClose, onDone }: DialogProps) {
  const t = useT();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (reason.trim().length < 3) {
      setError('נא לפרט את סיבת הביטול');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await postJson(`/api/jobs/${jobId}/cancel`, { reason: reason.trim() });
      onDone();
      onClose();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : t.errors.generic);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.job.cancelJob}
      description="הביטול מתועד ומוצג לשני הצדדים."
      footer={
        <>
          <Button variant="outline" onClick={onClose} className="flex-1">
            {t.common.back}
          </Button>
          <Button variant="destructive" onClick={submit} loading={submitting} className="flex-1">
            {t.job.cancelJob}
          </Button>
        </>
      }
    >
      <Field label={t.job.cancelReason} htmlFor="cancelReason" error={error ?? undefined} required>
        <Textarea
          id="cancelReason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={4}
          maxLength={500}
        />
      </Field>
    </Sheet>
  );
}

const REASONS: DisputeReason[] = ['price', 'not_performed', 'damage', 'no_show', 'payment_issue', 'other'];

export function DisputeDialog({ jobId, open, onClose, onDone }: DialogProps) {
  const t = useT();
  const [reason, setReason] = useState<DisputeReason>('price');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (description.trim().length < 10) {
      setError('נא לפרט את הבעיה (לפחות 10 תווים)');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await postJson(`/api/jobs/${jobId}/dispute`, { reason, description: description.trim() });
      onDone();
      onClose();
    } catch (disputeError) {
      setError(disputeError instanceof Error ? disputeError.message : t.errors.generic);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.dispute.title}
      footer={
        <>
          <Button variant="outline" onClick={onClose} className="flex-1">
            {t.common.cancel}
          </Button>
          <Button onClick={submit} loading={submitting} className="flex-1">
            {t.dispute.submit}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t.dispute.reason} htmlFor="disputeReason" required>
          <Select
            id="disputeReason"
            value={reason}
            onChange={(event) => setReason(event.target.value as DisputeReason)}
          >
            {REASONS.map((value) => (
              <option key={value} value={value}>
                {t.dispute.reasons[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={t.dispute.description}
          htmlFor="disputeDescription"
          error={error ?? undefined}
          required
        >
          <Textarea
            id="disputeDescription"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={5}
            maxLength={2000}
          />
        </Field>
      </div>
    </Sheet>
  );
}

/**
 * The customer's confirmation that the work happened.
 *
 * Two outcomes, and the second one matters most: saying it did not happen
 * returns the commission to the provider and opens a dispute, rather than
 * leaving a charged booking with nothing behind it. So the "לא בוצעה" path is
 * presented as plainly as the "כן" one — a confirmation screen that only
 * offers approval collects approvals, not information.
 */
export function ConfirmJobDialog({
  jobId,
  agreedPrice,
  open,
  onClose,
  onDone,
}: DialogProps & { agreedPrice: number | null }) {
  const t = useT();
  const [happened, setHappened] = useState<boolean | null>(null);
  const [reportedPrice, setReportedPrice] = useState(agreedPrice ? String(agreedPrice) : '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (happened === null) {
      setError('בחר אם העבודה בוצעה');
      return;
    }
    if (!happened && note.trim().length < 10) {
      setError('כתוב בקצרה מה קרה — זה מה שהבדיקה מתבססת עליו');
      return;
    }

    const parsedPrice = reportedPrice.trim() === '' ? null : Number(reportedPrice);
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice <= 0)) {
      setError('סכום לא תקין');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await postJson(`/api/jobs/${jobId}/confirm`, {
        happened,
        reportedPrice: happened ? parsedPrice : null,
        note: note.trim() || undefined,
      });
      onDone();
      onClose();
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : t.errors.generic);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="לאשר שהעבודה בוצעה?"
      description="האישור שלך הוא מה שמאפשר לנו לדעת שהעבודה אכן קרתה."
      footer={
        <>
          <Button variant="outline" onClick={onClose} className="flex-1">
            {t.common.back}
          </Button>
          <Button
            variant={happened === false ? 'destructive' : 'accent'}
            onClick={submit}
            loading={submitting}
            className="flex-1"
          >
            {t.common.send}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={happened === true ? 'accent' : 'outline'}
            onClick={() => setHappened(true)}
          >
            כן, בוצעה
          </Button>
          <Button
            type="button"
            variant={happened === false ? 'destructive' : 'outline'}
            onClick={() => setHappened(false)}
          >
            לא בוצעה
          </Button>
        </div>

        {happened === true ? (
          <Field
            label="כמה שילמת בפועל?"
            htmlFor="reportedPrice"
            hint="לא חייב. עוזר לנו לזהות פערים בין מה שסוכם למה שנגבה."
          >
            <Input
              id="reportedPrice"
              type="number"
              inputMode="decimal"
              min={1}
              value={reportedPrice}
              onChange={(event) => setReportedPrice(event.target.value)}
            />
          </Field>
        ) : null}

        <Field
          label={happened === false ? 'מה קרה?' : 'הערה (לא חייב)'}
          htmlFor="confirmNote"
          error={error ?? undefined}
          required={happened === false}
        >
          <Textarea
            id="confirmNote"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            maxLength={1000}
          />
        </Field>

        {happened === false ? (
          <p className="text-xs text-muted-foreground">
            הדיווח נרשם ונפתחת בדיקה. העמלה שנגבתה מבעל המקצוע תוחזר לו בינתיים — כדי שהוא
            לא ישלם על עבודה שלא יצאה לפועל, בלי קשר למי צודק.
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
