'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { DataTable, type Column } from './data-table';
import { useApi } from '@/hooks/use-api';
import { useDebounced } from '@/hooks/use-debounced';
import { patchJson } from '@/features/auth/lib/form';
import { useT } from '@/components/providers/i18n-provider';
import { formatDate } from '@/lib/utils/format';
import type { AccountStatus, UserRole } from '@/types/database';

interface UserRow {
  id: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  status: AccountStatus;
  status_reason: string | null;
  created_at: string;
  profiles: { full_name: string; avatar_url: string | null } | null;
}

const STATUS_VARIANT: Record<AccountStatus, 'success' | 'warning' | 'destructive'> = {
  active: 'success',
  suspended: 'warning',
  blocked: 'destructive',
};

const STATUS_LABEL: Record<AccountStatus, string> = {
  active: 'פעיל',
  suspended: 'מושעה',
  blocked: 'חסום',
};

const ROLE_LABEL: Record<UserRole, string> = {
  customer: 'לקוח',
  provider: 'בעל מקצוע',
  admin: 'מנהל',
};

export function UsersAdmin() {
  const t = useT();
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const search = useDebounced(query, 350);

  const params = new URLSearchParams({ pageSize: '50' });
  if (search.trim()) params.set('q', search.trim());
  if (role) params.set('role', role);

  const { data, loading, error, reload } = useApi<{ users: UserRow[] }>(
    `/api/admin/users?${params.toString()}`,
  );

  const [selected, setSelected] = useState<UserRow | null>(null);
  const [status, setStatus] = useState<AccountStatus>('suspended');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function apply() {
    if (!selected) return;
    setSaving(true);
    setActionError(null);
    try {
      await patchJson(`/api/admin/users/${selected.id}/status`, {
        status,
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

  const columns: Column<UserRow>[] = [
    {
      key: 'user',
      header: t.admin.users,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.profiles?.full_name || '—'}</p>
          <p className="truncate text-xs text-muted-foreground">{row.email ?? row.phone ?? '—'}</p>
        </div>
      ),
    },
    { key: 'role', header: 'תפקיד', render: (row) => <Badge variant="secondary">{ROLE_LABEL[row.role]}</Badge> },
    {
      key: 'status',
      header: t.common.status,
      render: (row) => (
        <div>
          <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
          {row.status_reason ? (
            <p className="mt-1 max-w-[16rem] truncate text-[11px] text-muted-foreground">
              {row.status_reason}
            </p>
          ) : null}
        </div>
      ),
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
          {row.status === 'active' ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelected(row);
                  setStatus('suspended');
                }}
              >
                {t.admin.suspend}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  setSelected(row);
                  setStatus('blocked');
                }}
              >
                {t.admin.block}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="success"
              onClick={() => {
                setSelected(row);
                setStatus('active');
              }}
            >
              {t.admin.activate}
            </Button>
          )}
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
          placeholder="חיפוש לפי אימייל או טלפון"
          aria-label="חיפוש משתמש"
          className="max-w-xs"
        />
        <Select
          value={role}
          onChange={(event) => setRole(event.target.value)}
          aria-label="תפקיד"
          className="max-w-[12rem]"
        >
          <option value="">{t.common.all}</option>
          <option value="customer">לקוח</option>
          <option value="provider">בעל מקצוע</option>
          <option value="admin">מנהל</option>
        </Select>
      </div>

      <DataTable
        caption={t.admin.users}
        columns={columns}
        rows={data?.users ?? []}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        onRetry={reload}
      />

      <Sheet
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="שינוי סטטוס משתמש"
        description={selected?.email ?? undefined}
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => setSelected(null)}>
              {t.common.cancel}
            </Button>
            <Button className="flex-1" loading={saving} onClick={apply}>
              {t.common.confirm}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t.common.status} htmlFor="userStatus">
            <Select
              id="userStatus"
              value={status}
              onChange={(event) => setStatus(event.target.value as AccountStatus)}
            >
              <option value="active">פעיל</option>
              <option value="suspended">מושעה</option>
              <option value="blocked">חסום</option>
            </Select>
          </Field>
          <Field label="סיבה" htmlFor="userReason" hint="מתועד ביומן פעולות המנהלים">
            <Textarea
              id="userReason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={500}
            />
          </Field>
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
