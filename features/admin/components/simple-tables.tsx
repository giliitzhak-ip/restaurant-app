'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Select, Textarea } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { Price } from '@/components/ui/price';
import { Rating } from '@/components/ui/rating';
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from './data-table';
import { useApi } from '@/hooks/use-api';
import { patchJson } from '@/features/auth/lib/form';
import { useT } from '@/components/providers/i18n-provider';
import { formatDate } from '@/lib/utils/format';
import type { DisputeStatus, JobStatus, PaymentStatus } from '@/types/database';

/* ── Jobs ─────────────────────────────────────────────────────────────────── */

interface AdminJobRow {
  id: string;
  reference: string;
  title: string;
  status: JobStatus;
  address: string;
  created_at: string;
  final_price: number | null;
  platform_fee: number | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  category: { name: string } | null;
  assigned_provider: { id: string; business_name: string } | null;
}

export function JobsAdmin() {
  const t = useT();
  const [status, setStatus] = useState('');
  const params = new URLSearchParams({ pageSize: '50' });
  if (status) params.set('status', status);

  const { data, loading, error, reload } = useApi<{ jobs: AdminJobRow[] }>(
    `/api/admin/jobs?${params.toString()}`,
  );

  const columns: Column<AdminJobRow>[] = [
    {
      key: 'job',
      header: t.admin.jobs,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.title}</p>
          <p className="num truncate text-xs text-muted-foreground">{row.reference}</p>
        </div>
      ),
    },
    { key: 'category', header: t.job.category, render: (row) => row.category?.name ?? '—' },
    {
      key: 'provider',
      header: t.job.provider,
      render: (row) => row.assigned_provider?.business_name ?? '—',
    },
    {
      key: 'price',
      header: t.job.price,
      render: (row) => (row.final_price ? <Price amount={Number(row.final_price)} size="sm" /> : '—'),
    },
    {
      key: 'fee',
      header: t.provider.platformFee,
      render: (row) => (row.platform_fee ? <Price amount={Number(row.platform_fee)} size="sm" /> : '—'),
    },
    {
      key: 'status',
      header: t.common.status,
      render: (row) => (
        <div>
          <StatusBadge kind="job" status={row.status} />
          {row.cancellation_reason ? (
            <p className="mt-1 max-w-[14rem] truncate text-[11px] text-muted-foreground">
              {row.cancelled_by}: {row.cancellation_reason}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'created',
      header: t.job.created,
      render: (row) => <span className="text-xs text-muted-foreground">{formatDate(row.created_at)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <Select
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        aria-label={t.common.status}
        className="max-w-[14rem]"
      >
        <option value="">{t.common.all}</option>
        {(Object.keys(t.job.statusLabel) as JobStatus[]).map((key) => (
          <option key={key} value={key}>
            {t.job.statusLabel[key]}
          </option>
        ))}
      </Select>

      <DataTable
        caption={t.admin.jobs}
        columns={columns}
        rows={data?.jobs ?? []}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        onRetry={reload}
      />
    </div>
  );
}

/* ── Payments ─────────────────────────────────────────────────────────────── */

interface AdminPaymentRow {
  id: string;
  amount: number;
  platform_fee: number;
  provider_payout: number;
  status: PaymentStatus;
  provider_name: string;
  external_id: string | null;
  created_at: string;
  captured_at: string | null;
  job: { id: string; reference: string; title: string } | null;
  provider: { id: string; business_name: string } | null;
}

export function PaymentsAdmin() {
  const t = useT();
  const { data, loading, error, reload } = useApi<{
    payments: AdminPaymentRow[];
    totals: { gross: number; fees: number; payouts: number };
  }>('/api/admin/payments?pageSize=50');

  const columns: Column<AdminPaymentRow>[] = [
    {
      key: 'job',
      header: t.admin.jobs,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.job?.title ?? '—'}</p>
          <p className="num truncate text-xs text-muted-foreground">{row.job?.reference ?? ''}</p>
        </div>
      ),
    },
    { key: 'provider', header: t.job.provider, render: (row) => row.provider?.business_name ?? '—' },
    { key: 'amount', header: 'סכום', render: (row) => <Price amount={Number(row.amount)} size="sm" /> },
    {
      key: 'fee',
      header: t.provider.platformFee,
      render: (row) => <Price amount={Number(row.platform_fee)} size="sm" />,
    },
    {
      key: 'payout',
      header: t.provider.netPayout,
      render: (row) => <Price amount={Number(row.provider_payout)} size="sm" />,
    },
    {
      key: 'status',
      header: t.common.status,
      render: (row) => (
        <div className="flex flex-col gap-1">
          <StatusBadge kind="payment" status={row.status} />
          <span className="text-[11px] text-muted-foreground">{row.provider_name}</span>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'תאריך',
      render: (row) => (
        <span className="text-xs text-muted-foreground">
          {formatDate(row.captured_at ?? row.created_at)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {data?.totals ? (
        <dl className="grid grid-cols-3 gap-3">
          {[
            { label: 'מחזור', amount: data.totals.gross },
            { label: t.admin.kpi.revenue, amount: data.totals.fees },
            { label: 'תשלומים לבעלי מקצוע', amount: data.totals.payouts },
          ].map((entry) => (
            <div key={entry.label} className="rounded-xl border bg-card p-4">
              <dd className="text-lg font-bold">
                <Price amount={entry.amount} />
              </dd>
              <dt className="text-xs text-muted-foreground">{entry.label}</dt>
            </div>
          ))}
        </dl>
      ) : null}

      <DataTable
        caption={t.admin.payments}
        columns={columns}
        rows={data?.payments ?? []}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        onRetry={reload}
      />
    </div>
  );
}

/* ── Reviews ──────────────────────────────────────────────────────────────── */

interface AdminReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  is_hidden: boolean;
  hidden_reason: string | null;
  flagged: boolean;
  created_at: string;
  job: { id: string; reference: string; title: string } | null;
  provider: { id: string; business_name: string } | null;
}

export function ReviewsAdmin() {
  const t = useT();
  const [filter, setFilter] = useState('');
  const params = new URLSearchParams({ pageSize: '50' });
  if (filter) params.set('status', filter);

  const { data, loading, error, reload } = useApi<{ reviews: AdminReviewRow[] }>(
    `/api/admin/reviews?${params.toString()}`,
  );

  const [selected, setSelected] = useState<AdminReviewRow | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function moderate(review: AdminReviewRow, hide: boolean) {
    setSaving(true);
    try {
      await patchJson(`/api/admin/reviews/${review.id}`, {
        isHidden: hide,
        reason: hide ? reason.trim() || undefined : undefined,
      });
      setSelected(null);
      setReason('');
      await reload();
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<AdminReviewRow>[] = [
    {
      key: 'rating',
      header: t.common.rating,
      render: (row) => <Rating value={Number(row.rating)} size="sm" showValue={false} />,
    },
    {
      key: 'comment',
      header: 'ביקורת',
      render: (row) => (
        <div className="max-w-md">
          <p className="line-clamp-2 text-sm">{row.comment ?? '—'}</p>
          <p className="text-[11px] text-muted-foreground">{row.job?.title ?? ''}</p>
        </div>
      ),
    },
    { key: 'provider', header: t.job.provider, render: (row) => row.provider?.business_name ?? '—' },
    {
      key: 'flags',
      header: 'סימונים',
      render: (row) => (
        <div className="flex gap-1">
          {row.flagged ? <Badge variant="warning">מסומן</Badge> : null}
          {row.is_hidden ? <Badge variant="destructive">מוסתר</Badge> : null}
        </div>
      ),
    },
    {
      key: 'date',
      header: 'תאריך',
      render: (row) => <span className="text-xs text-muted-foreground">{formatDate(row.created_at)}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (row) =>
        row.is_hidden ? (
          <Button size="sm" variant="outline" loading={saving} onClick={() => moderate(row, false)}>
            {t.admin.unhideReview}
          </Button>
        ) : (
          <Button size="sm" variant="destructive" onClick={() => setSelected(row)}>
            {t.admin.hideReview}
          </Button>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <Select
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        aria-label="סינון ביקורות"
        className="max-w-[14rem]"
      >
        <option value="">{t.common.all}</option>
        <option value="flagged">מסומנות לבדיקה</option>
        <option value="hidden">מוסתרות</option>
      </Select>

      <p className="text-xs text-muted-foreground">
        ביקורת אף פעם לא נמחקת. הסתרה מוציאה אותה מהפרופיל הציבורי ומהממוצע, והפעולה מתועדת.
      </p>

      <DataTable
        caption={t.admin.reviews}
        columns={columns}
        rows={data?.reviews ?? []}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        onRetry={reload}
      />

      <Sheet
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={t.admin.hideReview}
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => setSelected(null)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              loading={saving}
              onClick={() => selected && moderate(selected, true)}
            >
              {t.common.confirm}
            </Button>
          </>
        }
      >
        <Field label="סיבת ההסתרה" htmlFor="hideReason" required>
          <Textarea
            id="hideReason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={500}
          />
        </Field>
      </Sheet>
    </div>
  );
}

/* ── Disputes ─────────────────────────────────────────────────────────────── */

interface AdminDisputeRow {
  id: string;
  reason: string;
  description: string;
  status: DisputeStatus;
  resolution: string | null;
  opened_by_type: string;
  created_at: string;
  job: { id: string; reference: string; title: string; final_price: number | null } | null;
}

export function DisputesAdmin() {
  const t = useT();
  const [filter, setFilter] = useState('');
  const params = new URLSearchParams({ pageSize: '50' });
  if (filter) params.set('status', filter);

  const { data, loading, error, reload } = useApi<{ disputes: AdminDisputeRow[] }>(
    `/api/admin/disputes?${params.toString()}`,
  );

  const [selected, setSelected] = useState<AdminDisputeRow | null>(null);
  const [status, setStatus] = useState<DisputeStatus>('under_review');
  const [resolution, setResolution] = useState('');
  const [saving, setSaving] = useState(false);

  async function apply() {
    if (!selected) return;
    setSaving(true);
    try {
      await patchJson(`/api/admin/disputes/${selected.id}`, {
        status,
        resolution: resolution.trim() || undefined,
      });
      setSelected(null);
      setResolution('');
      await reload();
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<AdminDisputeRow>[] = [
    {
      key: 'job',
      header: t.admin.jobs,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.job?.title ?? '—'}</p>
          <p className="num truncate text-xs text-muted-foreground">{row.job?.reference ?? ''}</p>
        </div>
      ),
    },
    {
      key: 'reason',
      header: t.dispute.reason,
      render: (row) => (
        <div className="max-w-sm">
          <Badge variant="secondary">
            {t.dispute.reasons[row.reason as keyof typeof t.dispute.reasons] ?? row.reason}
          </Badge>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{row.description}</p>
        </div>
      ),
    },
    { key: 'by', header: 'נפתחה על ידי', render: (row) => row.opened_by_type },
    {
      key: 'status',
      header: t.common.status,
      render: (row) => <StatusBadge kind="dispute" status={row.status} />,
    },
    {
      key: 'date',
      header: 'תאריך',
      render: (row) => <span className="text-xs text-muted-foreground">{formatDate(row.created_at)}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <Button size="sm" variant="outline" onClick={() => setSelected(row)}>
          {t.common.details}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Select
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        aria-label="סינון תלונות"
        className="max-w-[14rem]"
      >
        <option value="">{t.common.all}</option>
        {(Object.keys(t.dispute.statusLabel) as DisputeStatus[]).map((key) => (
          <option key={key} value={key}>
            {t.dispute.statusLabel[key]}
          </option>
        ))}
      </Select>

      <DataTable
        caption={t.admin.disputes}
        columns={columns}
        rows={data?.disputes ?? []}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        onRetry={reload}
      />

      <Sheet
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={t.admin.disputes}
        description={selected?.job?.reference}
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => setSelected(null)}>
              {t.common.cancel}
            </Button>
            <Button className="flex-1" loading={saving} onClick={apply}>
              {t.common.save}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="rounded-lg bg-secondary p-3 text-sm">{selected?.description}</p>
          <Field label={t.common.status} htmlFor="disputeStatus">
            <Select
              id="disputeStatus"
              value={status}
              onChange={(event) => setStatus(event.target.value as DisputeStatus)}
            >
              <option value="under_review">{t.dispute.statusLabel.under_review}</option>
              <option value="resolved">{t.dispute.statusLabel.resolved}</option>
              <option value="rejected">{t.dispute.statusLabel.rejected}</option>
            </Select>
          </Field>
          <Field label="החלטה" htmlFor="resolution">
            <Textarea
              id="resolution"
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
              rows={4}
              maxLength={2000}
            />
          </Field>
        </div>
      </Sheet>
    </div>
  );
}
