'use client';

import { useState } from 'react';
import { Badge, Button, Card, Money } from '@/components/ui';
import { apiFetch, ApiRequestError } from '@/lib/client/api';

interface PaymentResult {
  status: string;
  grossAmount: number;
  platformFee: number;
  providerAmount: number;
  feeExplanation: string;
  isRealPayment: boolean;
  adapter: string;
}

/**
 * Payment step (spec §27, §53).
 *
 * The panel sends no amount — the server reads the price the provider
 * committed to. When the configured adapter does not move real money it says
 * so in plain language, because a fake success indistinguishable from a real
 * one is exactly what spec §53 forbids.
 */
export function PaymentPanel({
  jobId,
  status,
  payment,
  priceIls,
  onChanged,
}: {
  jobId: string;
  status: string;
  payment: { status: string; provider_name: string } | null;
  priceIls: number;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PaymentResult | null>(null);

  const paid = status === 'PAID' || status === 'REVIEWED' || payment?.status === 'CAPTURED';

  const run = async (action: 'authorize' | 'capture') => {
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch<PaymentResult>(`/api/jobs/${jobId}/payment`, {
        method: 'POST',
        json: { action },
      });
      setResult(response);
      onChanged();
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError ? caught.message : 'התשלום נכשל. נסו שוב.',
      );
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const authorized = result?.status === 'AUTHORIZED' || payment?.status === 'AUTHORIZED';
  const isTestAdapter = result ? !result.isRealPayment : payment?.provider_name === 'mock';

  return (
    <Card className={paid ? 'border-success-500/40' : undefined}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-white">{paid ? 'שולם' : 'תשלום'}</h2>
        <p className="text-2xl font-black text-white">
          <Money shekels={priceIls} />
        </p>
      </div>

      {isTestAdapter && (
        <div className="mt-3 rounded-xl border border-warning-500/40 bg-warning-500/10 px-3 py-2">
          <p className="text-sm font-semibold text-warning-400">תשלום בסביבת בדיקה</p>
          <p className="text-xs text-slate-400">
            לא מבוצע חיוב אמיתי. לא חוברה מערכת סליקה.
          </p>
        </div>
      )}

      {paid ? (
        <div className="mt-4">
          <Badge tone="success">התשלום נקלט</Badge>
          {result && (
            <dl className="mt-3 space-y-1 text-sm text-slate-400">
              <div className="flex justify-between">
                <dt>למקצוען</dt>
                <dd><Money agorot={result.providerAmount} /></dd>
              </div>
              <div className="flex justify-between">
                <dt>עמלת פלטפורמה ({result.feeExplanation})</dt>
                <dd><Money agorot={result.platformFee} /></dd>
              </div>
            </dl>
          )}
        </div>
      ) : (
        <>
          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-danger-500/10 px-3 py-2 text-sm text-danger-400">
              {error}
            </p>
          )}
          <div className="mt-4 space-y-3">
            {!authorized ? (
              <Button fullWidth size="lg" loading={busy} onClick={() => void run('authorize')}>
                אשרו את התשלום
              </Button>
            ) : (
              <Button
                fullWidth
                size="lg"
                variant="success"
                loading={busy}
                onClick={() => void run('capture')}
              >
                שלמו <Money shekels={priceIls} />
              </Button>
            )}
            <p className="text-center text-xs text-slate-500">
              {authorized
                ? 'התשלום אושר ומחויב רק עכשיו.'
                : 'שלב ראשון: אישור. החיוב מתבצע בשלב נפרד.'}
            </p>
          </div>
        </>
      )}
    </Card>
  );
}
