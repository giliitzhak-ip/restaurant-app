import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, authApi, type AdminOrganization, type OrgStatus } from '../lib/authClient';
import { Card, Dialog, EmptyState, Field, Notice, Tag } from '../components/ui';
import { formatDate, toDateInput } from '../lib/format';
import { normalize } from '../lib/search';

const STATUS_LABEL: Record<OrgStatus, string> = {
  pending: 'ממתין לאישור',
  approved: 'מאושר',
  suspended: 'מושעה',
  rejected: 'נדחה',
};

const ACCESS_LABEL: Record<string, string> = {
  full: 'פעיל',
  read_only: 'קריאה בלבד',
  blocked: 'חסום',
};

function addMonthsToToday(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return toDateInput(d.toISOString());
}

export function AdminConsole() {
  const [orgs, setOrgs] = useState<AdminOrganization[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<OrgStatus | 'all'>('pending');
  const [editing, setEditing] = useState<AdminOrganization | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      authApi
        .listOrganizations()
        .then((res) => {
          setOrgs(res.organizations);
          setErrors([]);
        })
        .catch((err: unknown) => {
          setErrors(err instanceof ApiError ? err.errors : ['לא ניתן לטעון את רשימת העסקים.']);
          setOrgs([]);
        }),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = normalize(query);
    return (orgs ?? [])
      .filter((o) => (filter === 'all' ? true : o.status === filter))
      .filter((o) => !q || normalize([o.name, o.contactName ?? '', o.email ?? '', o.phone ?? ''].join(' ')).includes(q));
  }, [orgs, query, filter]);

  const pendingCount = (orgs ?? []).filter((o) => o.status === 'pending').length;

  async function decide(org: AdminOrganization, patch: Parameters<typeof authApi.decideOrganization>[1]) {
    if (busy) return;
    setBusy(true);
    try {
      await authApi.decideOrganization(org.id, patch);
      await load();
      setEditing(null);
    } catch (err) {
      setErrors(err instanceof ApiError ? err.errors : ['הפעולה נכשלה.']);
    } finally {
      setBusy(false);
    }
  }

  if (orgs === null) return <Card><p className="muted">טוען עסקים…</p></Card>;

  return (
    <>
      <Card>
        <div className="card-title">
          <h2>עסקים במערכת</h2>
          {pendingCount > 0 && <Tag kind="warn">{pendingCount} ממתינים</Tag>}
        </div>

        {errors.length > 0 && <Notice kind="error">{errors.join(' ')}</Notice>}

        <Notice kind="info">
          כאן מאושרים עסקים חדשים ומנוהל המנוי. נתוני הלקוחות, היומנים והחתימות של
          כל עסק אינם נגישים ממסך זה.
        </Notice>

        <Field label="חיפוש עסק" htmlFor="org-search">
          <input id="org-search" type="search" placeholder="שם עסק, איש קשר, דוא״ל או טלפון…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </Field>

        <div className="chips">
          {([['pending', 'ממתינים'], ['approved', 'מאושרים'], ['suspended', 'מושעים'],
             ['rejected', 'נדחו'], ['all', 'הכול']] as const).map(([value, label]) => (
            <button key={value} type="button" className="chip"
              aria-pressed={filter === value}
              onClick={() => setFilter(value as OrgStatus | 'all')}>
              {label}
            </button>
          ))}
        </div>
      </Card>

      {visible.length === 0 ? (
        <Card><EmptyState icon="☐" title="אין עסקים בקטגוריה הזו." /></Card>
      ) : (
        visible.map((org) => (
          <Card key={org.id}>
            <div className="card-title">
              <h3>{org.name}</h3>
              <Tag kind={org.status === 'approved' ? 'ok' : org.status === 'pending' ? 'warn' : 'error'}>
                {STATUS_LABEL[org.status]}
              </Tag>
              {org.status === 'approved' && org.access !== 'full' && (
                <Tag kind="warn">{ACCESS_LABEL[org.access]}</Tag>
              )}
            </div>

            <dl className="small admin-meta">
              <dt>איש קשר</dt><dd>{org.contactName || '—'}</dd>
              <dt>דוא״ל</dt><dd className="wrap-anywhere">{org.email || '—'}</dd>
              <dt>טלפון</dt><dd>{org.phone || '—'}</dd>
              <dt>רישיון</dt><dd>{org.licenseNumber || '—'}</dd>
              <dt>נרשם</dt><dd>{formatDate(org.createdAt)}</dd>
              <dt>מסלול</dt><dd>{org.plan}</dd>
              <dt>שולם עד</dt><dd>{org.paidUntil ? formatDate(org.paidUntil) : 'לא שולם'}</dd>
              <dt>היקף</dt>
              <dd>{org.counts.users} משתמשים · {org.counts.journals} יומנים · {org.counts.customers} לקוחות</dd>
            </dl>

            {org.notes && <p className="small muted">הערה: {org.notes}</p>}

            <div className="row mt-3">
              {org.status === 'pending' && (
                <>
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy}
                    onClick={() => decide(org, { status: 'approved', paidUntil: addMonthsToToday(1), plan: 'trial' })}>
                    אשר · חודש ניסיון
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
                    onClick={() => decide(org, { status: 'rejected' })}>
                    דחה
                  </button>
                </>
              )}
              {org.status === 'approved' && (
                <>
                  <button type="button" className="btn btn-soft btn-sm" disabled={busy}
                    onClick={() => decide(org, { paidUntil: addMonthsToToday(1) })}>
                    + חודש
                  </button>
                  <button type="button" className="btn btn-soft btn-sm" disabled={busy}
                    onClick={() => decide(org, { paidUntil: addMonthsToToday(12) })}>
                    + שנה
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
                    onClick={() => decide(org, { status: 'suspended' })}>
                    השעה
                  </button>
                </>
              )}
              {(org.status === 'suspended' || org.status === 'rejected') && (
                <button type="button" className="btn btn-primary btn-sm" disabled={busy}
                  onClick={() => decide(org, { status: 'approved' })}>
                  החזר לפעילות
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(org)}>
                עריכה מלאה
              </button>
            </div>
          </Card>
        ))
      )}

      <OrgDialog
        key={editing?.id ?? 'none'}
        org={editing}
        busy={busy}
        onClose={() => setEditing(null)}
        onSave={(patch) => editing && decide(editing, patch)}
      />
    </>
  );
}

function OrgDialog({
  org, busy, onClose, onSave,
}: {
  org: AdminOrganization | null;
  busy: boolean;
  onClose: () => void;
  onSave: (patch: { status: OrgStatus; plan: string; paidUntil: string | null; notes: string }) => void;
}) {
  const [status, setStatus] = useState<OrgStatus>(org?.status ?? 'pending');
  const [plan, setPlan] = useState(org?.plan ?? 'trial');
  const [paidUntil, setPaidUntil] = useState(org?.paidUntil ?? '');
  const [notes, setNotes] = useState(org?.notes ?? '');

  if (!org) return null;

  return (
    <Dialog
      open
      title={org.name}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>ביטול</button>
          <button type="button" className="btn btn-primary" disabled={busy}
            onClick={() => onSave({ status, plan, paidUntil: paidUntil || null, notes })}>
            שמירה
          </button>
        </>
      }
    >
      <Field label="סטטוס" htmlFor="org-status">
        <select id="org-status" value={status} onChange={(e) => setStatus(e.target.value as OrgStatus)}>
          {(Object.keys(STATUS_LABEL) as OrgStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
      </Field>
      <Field label="מסלול" htmlFor="org-plan">
        <input id="org-plan" type="text" value={plan} onChange={(e) => setPlan(e.target.value)} />
      </Field>
      <Field label="שולם עד" htmlFor="org-paid" hint="ריק = לא שולם. לאחר התאריך העסק עובר לקריאה בלבד.">
        <input id="org-paid" type="date" value={paidUntil} onChange={(e) => setPaidUntil(e.target.value)} />
      </Field>
      <Field label="הערה פנימית" htmlFor="org-notes" hint="נראית לך בלבד.">
        <textarea id="org-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Dialog>
  );
}
