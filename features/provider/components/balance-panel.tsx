'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Plus, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Price } from '@/components/ui/price';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useApi } from '@/hooks/use-api';
import { useT } from '@/components/providers/i18n-provider';
import { postJson } from '@/features/auth/lib/form';
import { formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import type { BalanceEntryType } from '@/types/database';

interface LedgerEntry {
  id: string;
  type: BalanceEntryType;
  amount: number;
  balanceAfter: number;
  jobId: string | null;
  description: string | null;
  createdAt: string;
}

interface BalanceResponse {
  balance: number;
  state: 'ok' | 'low' | 'blocked';
  canAcceptWork: boolean;
  shortfall: number;
  lowBalanceThreshold: number;
  minimumBalance: number;
  presets: number[];
  suggestedTopup: number | null;
  entries: LedgerEntry[];
  policy: {
    refundOnCustomerCancellation: boolean;
    refundOnProviderCancellation: boolean;
    refundWindowHours: number;
  };
}

const ENTRY_LABEL: Record<BalanceEntryType, string> = {
  topup: 'טעינה',
  commission: 'עמלה',
  commission_refund: 'החזר עמלה',
  adjustment: 'תיאום',
};

/**
 * The provider's credit, and the one place they top it up.
 *
 * The copy here carries real weight: a provider who thinks this balance is
 * their earnings will be badly surprised. So every surface says the same two
 * things — the work's payment is collected from the customer directly, and this
 * balance only pays GET SERVICE's commission.
 */
export function BalancePanel() {
  const t = useT();
  const { data, loading, error, reload } = useApi<BalanceResponse>('/api/provider/balance');
  const [pending, setPending] = useState<number | null>(null);
  const [topupError, setTopupError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function topup(amount: number) {
    setPending(amount);
    setTopupError(null);
    setNotice(null);
    try {
      const result = await postJson<{
        redirectUrl: string | null;
        mocked: boolean;
        balance: number;
        topup: { status: string };
      }>('/api/provider/balance/topup', { amount });

      if (result.redirectUrl) {
        // A hosted gateway step finishes the top-up; the webhook credits the
        // balance when it comes back. `assign` rather than writing
        // `location.href`, which the compiler treats as mutating a value
        // defined outside the component.
        window.location.assign(result.redirectUrl);
        return;
      }
      setNotice(
        result.mocked
          ? 'הטעינה בוצעה במצב הדגמה (לא בוצע חיוב אמיתי) — היתרה עודכנה.'
          : 'הטעינה הושלמה והיתרה עודכנה.',
      );
      await reload();
    } catch (cause) {
      setTopupError(cause instanceof Error ? cause.message : 'הטעינה נכשלה');
    } finally {
      setPending(null);
    }
  }

  if (error) return <ErrorState description={error} onRetry={reload} />;

  const state = data?.state ?? 'ok';
  const tone =
    state === 'blocked'
      ? 'border-destructive/40 bg-destructive/5'
      : state === 'low'
        ? 'border-warning/40 bg-warning/5'
        : 'border-success/40 bg-success/5';

  const headline =
    state === 'blocked'
      ? t.provider.balanceBlocked
      : state === 'low'
        ? t.provider.balanceLow
        : t.provider.balanceOk;

  return (
    <div className="space-y-4">
      <Card className={cn(tone)}>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground">{t.provider.balance}</p>
              <p className="text-3xl font-bold">
                {loading && !data ? (
                  <span className="text-muted-foreground">…</span>
                ) : (
                  <Price amount={data?.balance ?? 0} />
                )}
              </p>
            </div>
            {state === 'ok' ? (
              <CheckCircle2 className="size-6 text-success" aria-hidden />
            ) : (
              <AlertTriangle
                className={cn('size-6', state === 'blocked' ? 'text-destructive' : 'text-warning')}
                aria-hidden
              />
            )}
          </div>

          <p className="text-sm font-medium">{headline}</p>
          <p className="text-xs text-muted-foreground">{t.provider.balanceHint}</p>

          {data && data.shortfall > 0 ? (
            <p className="text-xs font-medium text-destructive">
              כדי לחזור לקבל עבודות נדרשת טעינה של <Price amount={data.shortfall} size="sm" /> לפחות.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="size-4" aria-hidden />
            {t.provider.topup}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(data?.presets ?? [100, 250, 500, 1000]).map((preset) => (
              <Button
                key={preset}
                type="button"
                variant={data?.suggestedTopup === preset ? 'accent' : 'outline'}
                size="sm"
                disabled={pending !== null}
                onClick={() => void topup(preset)}
              >
                {pending === preset ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                <span className="num">₪{preset}</span>
              </Button>
            ))}
          </div>

          {topupError ? <p className="text-sm text-destructive">{topupError}</p> : null}
          {notice ? <p className="text-sm text-success">{notice}</p> : null}

          {data ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              עמלה שנגבתה מוחזרת ליתרה אם הלקוח ביטל
              {data.policy.refundOnCustomerCancellation ? '' : ' (כרגע מושבת במדיניות)'}, או אם
              התברר שהעבודה לא בוצעה — עד {data.policy.refundWindowHours} שעות מהגבייה.
              {data.policy.refundOnProviderCancellation
                ? ''
                : ' ביטול מצידך אינו מזכה בהחזר.'}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="size-4" aria-hidden />
            {t.provider.ledger}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!loading && (data?.entries.length ?? 0) === 0 ? (
            <EmptyState
              title="אין עדיין תנועות"
              description="טעינות, עמלות והחזרים יופיעו כאן."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">{t.provider.ledger}</caption>
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th scope="col" className="p-2 text-start">
                      פעולה
                    </th>
                    <th scope="col" className="p-2 text-start">
                      סכום
                    </th>
                    <th scope="col" className="p-2 text-start">
                      יתרה אחרי
                    </th>
                    <th scope="col" className="p-2 text-start">
                      תאריך
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.entries ?? []).map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0">
                      <td className="p-2">
                        <span className="block font-medium">{ENTRY_LABEL[entry.type]}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {entry.description ?? ''}
                        </span>
                      </td>
                      {/* dir="ltr": a leading minus lands on the wrong side of
                          the figure when the paragraph direction is RTL. */}
                      <td
                        dir="ltr"
                        className={cn(
                          'num p-2 text-end font-semibold',
                          entry.amount < 0 ? 'text-muted-foreground' : 'text-success',
                        )}
                      >
                        {entry.amount < 0 ? '−' : '+'}
                        <Price amount={Math.abs(entry.amount)} size="sm" />
                      </td>
                      <td className="num p-2">
                        <Price amount={entry.balanceAfter} size="sm" />
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {formatDate(entry.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
