'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Price } from '@/components/ui/price';
import { DataTable, type Column } from './data-table';
import { useApi } from '@/hooks/use-api';
import { formatDate, formatPercent } from '@/lib/utils/format';
import type { ProviderIntegrityRow, RepeatCustomerRow } from '@/types/database';
import type { VerificationState } from '@/lib/services/jobs/verification';

interface UnverifiedJob {
  id: string;
  reference: string;
  title: string;
  status: string;
  completed_at: string | null;
  commission_amount: number | null;
  arrival_verified_at: string | null;
  arrival_distance_m: number | null;
  customer_confirmed_at: string | null;
  completionPhotos: number;
  verification: VerificationState;
  provider: { id: string; business_name: string } | null;
}

interface IntegrityResponse {
  providers: ProviderIntegrityRow[];
  repeatCustomers: RepeatCustomerRow[];
  unverifiedJobs: UnverifiedJob[];
  suspectedNoShows: number;
  window: { days: number; since: string };
  thresholds: { arrivalRadiusM: number; autoConfirmAfterHours: number };
}

/**
 * Three reads on whether charged bookings actually produced work.
 *
 * Deliberately not a score. A low completion rate has plenty of innocent
 * explanations, and presenting it as a verdict would get honest providers
 * suspended. Each table says what it counted and over what window; the
 * judgement stays with the person reading it.
 */
export function IntegrityAdmin() {
  const { data, loading, error, reload } = useApi<IntegrityResponse>('/api/admin/integrity');

  const providerColumns: Column<ProviderIntegrityRow>[] = [
    { key: 'name', header: 'בעל מקצוע', render: (row) => row.business_name },
    { key: 'accepted', header: 'עבודות שקיבל', render: (row) => <span className="num">{row.accepted}</span> },
    {
      key: 'completed',
      header: 'הושלמו',
      render: (row) => (
        <span className="num">
          {row.completed} ({formatPercent(Number(row.completion_rate))})
        </span>
      ),
    },
    {
      key: 'confirmed',
      header: 'אישור לקוח',
      render: (row) => (
        <span className="num">
          {row.customer_confirmed} ({formatPercent(Number(row.confirmation_rate))})
        </span>
      ),
    },
    {
      key: 'arrival',
      header: 'הגעה אומתה',
      render: (row) => <span className="num">{row.arrival_verified}</span>,
    },
    {
      key: 'cancelled',
      header: 'ביטל אחרי קבלה',
      render: (row) =>
        Number(row.cancelled_after_accept) > 0 ? (
          <Badge variant="warning">{row.cancelled_after_accept}</Badge>
        ) : (
          <span className="num">0</span>
        ),
    },
    {
      key: 'commission',
      header: 'עמלות',
      render: (row) => (
        <div className="text-xs">
          <Price amount={Number(row.commission_charged)} size="sm" />
          {Number(row.commission_refunded) > 0 ? (
            <span className="block text-muted-foreground">
              הוחזר: <Price amount={Number(row.commission_refunded)} size="sm" />
            </span>
          ) : null}
        </div>
      ),
    },
  ];

  const repeatColumns: Column<RepeatCustomerRow>[] = [
    { key: 'name', header: 'בעל מקצוע', render: (row) => row.business_name },
    { key: 'customers', header: 'לקוחות', render: (row) => <span className="num">{row.customers}</span> },
    {
      key: 'repeat',
      header: 'לקוחות חוזרים',
      render: (row) => (
        <span className="num">
          {row.repeat_customers} ({formatPercent(Number(row.repeat_rate))})
        </span>
      ),
    },
  ];

  const jobColumns: Column<UnverifiedJob>[] = [
    {
      key: 'job',
      header: 'עבודה',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.title}</p>
          <p className="num truncate text-xs text-muted-foreground">
            {row.reference} · {formatDate(row.completed_at)}
          </p>
        </div>
      ),
    },
    { key: 'provider', header: 'בעל מקצוע', render: (row) => row.provider?.business_name ?? '—' },
    {
      key: 'commission',
      header: 'עמלה שנגבתה',
      render: (row) => <Price amount={Number(row.commission_amount ?? 0)} size="sm" />,
    },
    {
      key: 'evidence',
      header: 'עדויות',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.arrival_distance_m !== null ? (
            <Badge variant="warning">
              צ&apos;ק-אין {Math.round(Number(row.arrival_distance_m))} מ&apos;
            </Badge>
          ) : (
            <Badge variant="outline">אין צ&apos;ק-אין</Badge>
          )}
          {row.completionPhotos > 0 ? (
            <Badge variant="success">{row.completionPhotos} תמונות</Badge>
          ) : (
            <Badge variant="outline">אין תמונות</Badge>
          )}
          {row.verification.suspectedNoShow ? (
            <Badge variant="destructive">חשד שלא בוצעה</Badge>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {data ? (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-4">
            <dd className="num text-lg font-bold">{data.unverifiedJobs.length}</dd>
            <dt className="text-xs text-muted-foreground">עבודות בלי שום אימות</dt>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <dd className="num text-lg font-bold">{data.suspectedNoShows}</dd>
            <dt className="text-xs text-muted-foreground">חשד שלא בוצעו</dt>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <dd className="num text-lg font-bold">{data.thresholds.arrivalRadiusM} מ&apos;</dd>
            <dt className="text-xs text-muted-foreground">רדיוס אימות הגעה</dt>
          </div>
        </dl>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">מה יצא מהעבודות שנגבתה עליהן עמלה</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            caption="שלמות עבודות לפי בעל מקצוע"
            columns={providerColumns}
            rows={data?.providers ?? []}
            rowKey={(row) => row.provider_id}
            loading={loading}
            error={error}
            onRetry={reload}
            emptyTitle="אין עוד מספיק עבודות כדי להציג יחסים"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">לקוחות חוזרים</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            זוג לקוח–בעל מקצוע שנפגש פעם אחת ונעלם הוא המצב הרגיל. בעל מקצוע שלקוחות חוזרים
            אליו דרך האפליקציה הוא מי שהעמלה בעצם קונה.
          </p>
          <DataTable
            caption="לקוחות חוזרים לפי בעל מקצוע"
            columns={repeatColumns}
            rows={data?.repeatCustomers ?? []}
            rowKey={(row) => row.provider_id}
            loading={loading}
            error={error}
            onRetry={reload}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">עבודות שנגבתה עליהן עמלה בלי שום עדות</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            caption="עבודות ללא אימות"
            columns={jobColumns}
            rows={data?.unverifiedJobs ?? []}
            rowKey={(row) => row.id}
            loading={loading}
            error={error}
            onRetry={reload}
            emptyTitle="לכל העבודות שנגבתה עליהן עמלה יש אימות כלשהו"
          />
        </CardContent>
      </Card>
    </div>
  );
}
