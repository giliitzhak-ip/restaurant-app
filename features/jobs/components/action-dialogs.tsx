'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Select, Textarea } from '@/components/ui/input';
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
