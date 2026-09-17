import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Price } from '@/components/ui/price';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/states';
import { getServerSupabase } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/auth/session';
import { getServerDictionary } from '@/lib/i18n/server';
import { formatDate, formatPercent } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'הכנסות' };

interface PaymentRow {
  id: string;
  amount: number;
  platform_fee: number;
  provider_payout: number;
  status: 'pending' | 'authorized' | 'captured' | 'refunded' | 'failed' | 'cancelled';
  created_at: string;
  captured_at: string | null;
  job: { id: string; reference: string; title: string } | null;
}

export default async function ProviderEarningsPage() {
  const [{ t }, session] = await Promise.all([getServerDictionary(), getSessionContext()]);
  if (!session?.providerId) redirect('/provider');

  const supabase = await getServerSupabase();
  let payments: PaymentRow[] = [];

  if (supabase) {
    const { data } = await supabase
      .from('payments')
      .select(
        `id, amount, platform_fee, provider_payout, status, created_at, captured_at,
         job:jobs (id, reference, title)`,
      )
      .eq('provider_id', session.providerId)
      .order('created_at', { ascending: false })
      .limit(100);

    payments = (data ?? []) as unknown as PaymentRow[];
  }

  const captured = payments.filter((payment) => payment.status === 'captured');
  const pending = payments.filter((payment) => payment.status === 'authorized');

  const totals = captured.reduce(
    (acc, payment) => ({
      gross: acc.gross + Number(payment.amount),
      fees: acc.fees + Number(payment.platform_fee),
      net: acc.net + Number(payment.provider_payout),
    }),
    { gross: 0, fees: 0, net: 0 },
  );

  const pendingTotal = pending.reduce((sum, payment) => sum + Number(payment.provider_payout), 0);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">{t.provider.earnings}</h1>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: t.provider.grossPrice, amount: totals.gross },
          { label: t.provider.platformFee, amount: totals.fees },
          { label: t.provider.netPayout, amount: totals.net },
          { label: 'ממתין לגבייה', amount: pendingTotal },
        ].map((entry) => (
          <div key={entry.label} className="rounded-xl border bg-card p-4">
            <dd className="text-lg font-bold">
              <Price amount={entry.amount} />
            </dd>
            <dt className="text-xs text-muted-foreground">{entry.label}</dt>
          </div>
        ))}
      </dl>

      {totals.gross > 0 ? (
        <p className="text-xs text-muted-foreground">
          עמלה ממוצעת בפועל: <span className="num">{formatPercent(totals.fees / totals.gross)}</span>
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="size-4" aria-hidden />
            עסקאות
          </CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <EmptyState title="עדיין אין עסקאות" description="כשתשלים עבודה ראשונה היא תופיע כאן." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">רשימת עסקאות</caption>
                <thead>
                  <tr className="border-b text-start text-xs text-muted-foreground">
                    <th scope="col" className="p-2 text-start">
                      עבודה
                    </th>
                    <th scope="col" className="p-2 text-start">
                      {t.provider.grossPrice}
                    </th>
                    <th scope="col" className="p-2 text-start">
                      {t.provider.platformFee}
                    </th>
                    <th scope="col" className="p-2 text-start">
                      {t.provider.netPayout}
                    </th>
                    <th scope="col" className="p-2 text-start">
                      {t.common.status}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-b last:border-0">
                      <td className="p-2">
                        <span className="block truncate font-medium">{payment.job?.title ?? '—'}</span>
                        <span className="num block text-[11px] text-muted-foreground">
                          {formatDate(payment.captured_at ?? payment.created_at)}
                        </span>
                      </td>
                      <td className="num p-2">
                        <Price amount={Number(payment.amount)} size="sm" />
                      </td>
                      <td className="num p-2 text-muted-foreground">
                        −<Price amount={Number(payment.platform_fee)} size="sm" />
                      </td>
                      <td className="num p-2 font-semibold">
                        <Price amount={Number(payment.provider_payout)} size="sm" />
                      </td>
                      <td className="p-2">
                        <StatusBadge kind="payment" status={payment.status} />
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
