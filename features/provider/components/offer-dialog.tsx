'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { PriceBreakdown } from '@/components/ui/price';
import { postJson, fieldErrorsOf } from '@/features/auth/lib/form';
import { createOfferSchema } from '@/lib/validation/jobs';
import { useT } from '@/components/providers/i18n-provider';

interface Props {
  jobId: string;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

interface QuoteBreakdown {
  gross: number;
  platformFee: number;
  net: number;
}

/**
 * Offer form.
 *
 * Shows the provider exactly what they will take home before they commit: the
 * split is computed server-side from the live fee rules, so the number here is
 * the number that will be paid out.
 */
export function OfferDialog({ jobId, open, onClose, onDone }: Props) {
  const t = useT();
  const [price, setPrice] = useState('');
  const [eta, setEta] = useState('30');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [quote, setQuote] = useState<QuoteBreakdown | null>(null);

  useEffect(() => {
    const amount = Number(price);
    const controller = new AbortController();

    // Everything that touches state happens in the debounced callback, so the
    // effect body itself never triggers a synchronous re-render.
    const timer = setTimeout(async () => {
      if (!amount || amount <= 0) {
        setQuote(null);
        return;
      }
      try {
        const response = await fetch(`/api/provider/quote?amount=${amount}`, {
          signal: controller.signal,
        });
        const payload = (await response.json()) as
          | { ok: true; data: QuoteBreakdown }
          | { ok: false };
        if (payload.ok) setQuote(payload.data);
      } catch {
        setQuote(null);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [price]);

  async function submit() {
    setFormError(null);

    const parsed = createOfferSchema.safeParse({
      price: Number(price),
      etaMinutes: Number(eta),
      note: note.trim() || undefined,
    });

    if (!parsed.success) {
      setErrors(fieldErrorsOf(parsed.error));
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      await postJson(`/api/jobs/${jobId}/offers`, parsed.data);
      onDone();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t.errors.generic);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.offer.title}
      footer={
        <>
          <Button variant="outline" onClick={onClose} className="flex-1">
            {t.common.cancel}
          </Button>
          <Button variant="success" onClick={submit} loading={submitting} className="flex-1">
            {t.offer.send}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t.offer.price} htmlFor="offerPrice" error={errors.price} required>
          <Input
            id="offerPrice"
            type="number"
            inputMode="numeric"
            min={1}
            dir="ltr"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </Field>

        <Field
          label={`${t.offer.eta} (${t.common.minutes})`}
          htmlFor="offerEta"
          error={errors.etaMinutes}
          required
        >
          <Input
            id="offerEta"
            type="number"
            inputMode="numeric"
            min={1}
            dir="ltr"
            value={eta}
            onChange={(event) => setEta(event.target.value)}
          />
        </Field>

        <Field label={t.offer.note} htmlFor="offerNote" hint={t.common.optional}>
          <Textarea
            id="offerNote"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            maxLength={500}
          />
        </Field>

        {quote ? (
          <PriceBreakdown
            rows={[
              { label: t.provider.grossPrice, amount: quote.gross },
              { label: t.provider.platformFee, amount: quote.platformFee, negative: true, muted: true },
            ]}
            total={{ label: t.provider.netPayout, amount: quote.net }}
          />
        ) : null}

        {formError ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {formError}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
