import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Clock, HandCoins, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Price } from '@/components/ui/price';
import { EmptyState } from '@/components/ui/states';
import { getServerSupabase } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/auth/session';
import { getServerDictionary } from '@/lib/i18n/server';
import { formatDate, formatPercent } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'הכנסות' };

interface JobRow {
  id: string;
  reference: string;
  title: string;
  status: string;
  final_price: number | null;
  commission_amount: number | null;
  commission_refunded_at: string | null;
  completed_at: string | null;
  created_at: string;
  arrival_verified_at: string | null;
  customer_confirmed_at: string | null;
}

/**
 * What the provider earned, and what it cost them.
 *
 * The important distinction the page has to carry: "collected" is money the
 * provider took from the customer themselves — GET SERVICE never held it and
 * cannot confirm it. What the platform knows for certain is the commission it
 * charged, which is why that column is the exact one and the other is labelled
 * as the agreed price.
 */
export default async function ProviderEarningsPage() {
  const [{ t }, session] = await Promise.all([getServerDictionary(), getSessionContext()]);
  if (!session?.providerId) redirect('/provider');

  const supabase = await getServerSupabase();
  let jobs: JobRow[] = [];

  if (supabase) {
    const { data } = await supabase
      .from('jobs')
      .select(
        `id, reference, title, status, final_price, commission_amount, commission_refunded_at,
         completed_at, created_at, arrival_verified_at, customer_confirmed_at`,
      )
      .eq('assigned_provider_id', session.providerId)
      .not('commission_charged_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100);

    jobs = (data ?? []) as unknown as JobRow[];
  }

  const completed = jobs.filter((job) => job.status === 'completed');

  const totals = completed.reduce(
    (acc, job) => ({
      agreed: acc.agreed + Number(job.final_price ?? 0),
      commission:
        acc.commission + (job.commission_refunded_at ? 0 : Number(job.commission_amount ?? 0)),
    }),
    { agreed: 0, commission: 0 },
  );

  const awaitingConfirmation = completed.filter((job) => !job.customer_confirmed_at).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t.provider.earnings}</h1>
        <Button asChild variant="ghost" size="sm">
          <Link href="/provider/balance">
            {t.provider.balance}
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: t.provider.collectedDirectly, amount: totals.agreed },
          { label: t.provider.commissionPaid, amount: totals.commission },
          { label: t.provider.netPayout, amount: totals.agreed - totals.commission },
        ].map((entry) => (
          <div key={entry.label} className="rounded-xl border bg-card p-4">
            <dd className="text-lg font-bold">
              <Price amount={entry.amount} />
            </dd>
            <dt className="text-xs text-muted-foreground">{entry.label}</dt>
          </div>
        ))}
        <div className="rounded-xl border bg-card p-4">
          <dd className="text-lg font-bold num">{completed.length}</dd>
          <dt className="text-xs text-muted-foreground">{t.provider.completedJobs}</dt>
        </div>
      </dl>

      <Card className="border-muted">
        <CardContent className="flex items-start gap-3 pt-5">
          <HandCoins className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-xs leading-relaxed text-muted-foreground">
            הסכומים כאן הם המחירים שסוכמו בהצעות שלך. את הכסף עצמו אתה גובה ישירות מהלקוח —
            GET SERVICE לא מחזיקה אותו ולא מעבירה אותו. מה שהפלטפורמה גובה היא העמלה, והיא
            נלקחת מהיתרה שלך ברגע שלקוח בוחר בך.
          </p>
        </CardContent>
      </Card>

      {totals.agreed > 0 ? (
        <p className="text-xs text-muted-foreground">
          עמלה ממוצעת בפועל:{' '}
          <span className="num">{formatPercent(totals.commission / totals.agreed)}</span>
          {awaitingConfirmation > 0 ? (
            <>
              {' · '}
              {awaitingConfirmation} {awaitingConfirmation === 1 ? 'עבודה' : 'עבודות'}{' '}
              {t.provider.awaitingConfirmation}
            </>
          ) : null}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">עבודות שקיבלת</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <EmptyState
              title="עדיין לא קיבלת עבודות"
              description="עבודה שלקוח יבחר בך אליה תופיע כאן, יחד עם העמלה שנגבתה עליה."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">עבודות ועמלות</caption>
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
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
                      אימות
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id} className="border-b last:border-0">
                      <td className="p-2">
                        <Link href={`/provider/jobs/${job.id}`} className="block truncate font-medium hover:underline">
                          {job.title}
                        </Link>
                        <span className="num block text-[11px] text-muted-foreground">
                          {formatDate(job.completed_at ?? job.created_at)} · {job.reference}
                        </span>
                      </td>
                      <td className="num p-2">
                        <Price amount={Number(job.final_price ?? 0)} size="sm" />
                      </td>
                      <td className="num p-2 text-muted-foreground">
                        {job.commission_refunded_at ? (
                          <span className="text-success">הוחזר</span>
                        ) : (
                          <>
                            −<Price amount={Number(job.commission_amount ?? 0)} size="sm" />
                          </>
                        )}
                      </td>
                      <td className="p-2">
                        <div className="flex flex-col gap-0.5 text-[11px]">
                          <span
                            className={
                              job.arrival_verified_at ? 'text-success' : 'text-muted-foreground'
                            }
                          >
                            <MapPin className="inline size-3" aria-hidden />{' '}
                            {job.arrival_verified_at
                              ? t.provider.arrivalVerified
                              : t.provider.arrivalUnverified}
                          </span>
                          <span
                            className={
                              job.customer_confirmed_at ? 'text-success' : 'text-muted-foreground'
                            }
                          >
                            {job.customer_confirmed_at ? (
                              <CheckCircle2 className="inline size-3" aria-hidden />
                            ) : (
                              <Clock className="inline size-3" aria-hidden />
                            )}{' '}
                            {job.customer_confirmed_at
                              ? t.provider.customerConfirmed
                              : t.provider.awaitingConfirmation}
                          </span>
                        </div>
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
