'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { StatusBadge } from '@/components/ui/status-badge';
import { Rating } from '@/components/ui/rating';
import { DataTable, type Column } from './data-table';
import { useApi } from '@/hooks/use-api';
import { useDebounced } from '@/hooks/use-debounced';
import { patchJson } from '@/features/auth/lib/form';
import { useT } from '@/components/providers/i18n-provider';
import { formatDate } from '@/lib/utils/format';
import type { ProviderStatus } from '@/types/database';

interface ProviderRow {
  id: string;
  business_name: string;
  owner_name: string;
  phone: string;
  email: string | null;
  status: ProviderStatus;
  status_reason: string | null;
  rating_avg: number;
  rating_count: number;
  completed_jobs: number;
  onboarding_completed: boolean;
  created_at: string;
  provider_categories: Array<{ categories: { name: string } | null }> | null;
  provider_documents: Array<{ id: string; doc_type: string; status: string; file_name: string | null }> | null;
}

/** Provider verification queue — the only place `provider_profiles.status` changes. */
export function ProvidersAdmin({ initialStatus = '' }: { initialStatus?: string }) {
  const t = useT();
  const [status, setStatus] = useState(initialStatus);
  const [query, setQuery] = useState('');
  const search = useDebounced(query, 350);

  const params = new URLSearchParams({ pageSize: '50' });
  if (status) params.set('status', status);
  if (search.trim()) params.set('q', search.trim());

  const { data, loading, error, reload } = useApi<{ providers: ProviderRow[] }>(
    `/api/admin/providers?${params.toString()}`,
  );

  const [selected, setSelected] = useState<ProviderRow | null>(null);
  const [decision, setDecision] = useState<ProviderStatus>('verified');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function apply() {
    if (!selected) return;
    setSaving(true);
    setActionError(null);
    try {
      await patchJson(`/api/admin/providers/${selected.id}/verify`, {
        status: decision,
        reason: reason.trim() || undefined,
      });
      setSelected(null);
      setReason('');
      await reload();
    } catch (applyError) {
      setActionError(applyError instanceof Error ? applyError.message : t.errors.generic);
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<ProviderRow>[] = [
    {
      key: 'business',
      header: t.admin.providers,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.business_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.owner_name} · <span className="num">{row.phone}</span>
          </p>
        </div>
      ),
    },
    {
      key: 'categories',
      header: t.admin.categories,
      render: (row) => (
        <span className="text-xs text-muted-foreground">
          {(row.provider_categories ?? [])
            .map((link) => link.categories?.name)
            .filter(Boolean)
            .join(', ') || '—'}
        </span>
      ),
    },
    {
      key: 'documents',
      header: t.onboarding.stepDocuments,
      render: (row) => (
        <span className="num text-xs">
          {row.provider_documents?.length ?? 0}
          {row.onboarding_completed ? '' : ' (טרם הוגש)'}
        </span>
      ),
    },
    {
      key: 'rating',
      header: t.common.rating,
      render: (row) =>
        row.rating_count ? (
          <Rating value={Number(row.rating_avg)} count={row.rating_count} size="sm" />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: 'jobs',
      header: t.common.jobs,
      render: (row) => <span className="num">{row.completed_jobs}</span>,
    },
    {
      key: 'status',
      header: t.common.status,
      render: (row) => <StatusBadge kind="provider" status={row.status} />,
    },
    {
      key: 'created',
      header: 'נרשם',
      render: (row) => <span className="text-xs text-muted-foreground">{formatDate(row.created_at)}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="flex gap-1">
          {row.status !== 'verified' ? (
            <Button
              size="sm"
              variant="success"
              onClick={() => {
                setSelected(row);
                setDecision('verified');
              }}
            >
              <Check aria-hidden />
              {t.admin.verify}
            </Button>
          ) : null}
          {row.status !== 'rejected' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelected(row);
                setDecision('rejected');
              }}
            >
              <X aria-hidden />
              {t.admin.reject}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="חיפוש לפי שם עסק"
          aria-label="חיפוש בעל מקצוע"
          className="max-w-xs"
        />
        <Select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label={t.common.status}
          className="max-w-[12rem]"
        >
          <option value="">{t.common.all}</option>
          <option value="pending">ממתין לאימות</option>
          <option value="verified">מאומת</option>
          <option value="rejected">נדחה</option>
          <option value="suspended">מושעה</option>
        </Select>
      </div>

      <DataTable
        caption={t.admin.providers}
        columns={columns}
        rows={data?.providers ?? []}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        onRetry={reload}
      />

      <Sheet
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={decision === 'verified' ? t.admin.verify : t.admin.reject}
        description={selected?.business_name}
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => setSelected(null)}>
              {t.common.cancel}
            </Button>
            <Button
              className="flex-1"
              variant={decision === 'verified' ? 'success' : 'destructive'}
              loading={saving}
              onClick={apply}
            >
              {t.common.confirm}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t.common.status} htmlFor="decision">
            <Select
              id="decision"
              value={decision}
              onChange={(event) => setDecision(event.target.value as ProviderStatus)}
            >
              <option value="verified">מאומת</option>
              <option value="rejected">נדחה</option>
              <option value="suspended">מושעה</option>
              <option value="pending">חזרה לבדיקה</option>
            </Select>
          </Field>

          <Field
            label="הערה לבעל המקצוע"
            htmlFor="reason"
            hint="ההערה תוצג לו בפרופיל. חובה כשדוחים או משעים."
          >
            <Textarea
              id="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={500}
            />
          </Field>

          {selected?.provider_documents?.length ? (
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-sm font-medium">{t.onboarding.stepDocuments}</p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {selected.provider_documents.map((document) => (
                  <li key={document.id}>
                    {document.doc_type} — {document.file_name ?? 'ללא שם'} ({document.status})
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-muted-foreground">
                הקבצים עצמם נשמרים באחסון פרטי ונפתחים דרך Supabase Storage בלבד.
              </p>
            </div>
          ) : null}

          {actionError ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {actionError}
            </p>
          ) : null}
        </div>
      </Sheet>
    </div>
  );
}
