import { useCallback, useEffect, useState } from 'react';
import { ApiError, authApi, type AuthUser, type UserRole } from '../lib/authClient';
import { useAuth } from '../state/auth';
import { Card, Dialog, Field, Notice, Tag } from '../components/ui';

const ROLE_LABEL: Record<UserRole, string> = {
  owner: 'בעל העסק',
  exterminator: 'מדביר',
  field: 'עובד שטח',
};

const ROLE_HINT: Record<UserRole, string> = {
  owner: 'גישה מלאה, כולל ניהול עובדים.',
  exterminator: 'תיעוד מלא, חתימה והפקת מסמכים.',
  field: 'תיעוד בשטח.',
};

export function TeamScreen() {
  const { user, access } = useAuth();
  const [users, setUsers] = useState<AuthUser[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ name: '', email: '', role: 'exterminator' as UserRole, password: '', licenseNumber: '' });

  const isOwner = user?.role === 'owner';

  const load = useCallback(
    () =>
      authApi
        .listEmployees()
        .then((res) => {
          setUsers(res.users);
          setErrors([]);
        })
        .catch((err: unknown) => {
          setErrors(err instanceof ApiError ? err.errors : ['לא ניתן לטעון את רשימת העובדים.']);
          setUsers([]);
        }),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function create(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setErrors([]);
    try {
      await authApi.createEmployee(draft);
      setDraft({ name: '', email: '', role: 'exterminator', password: '', licenseNumber: '' });
      setOpen(false);
      await load();
    } catch (err) {
      setErrors(err instanceof ApiError ? err.errors : ['הוספת העובד נכשלה.']);
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: { status?: 'active' | 'disabled'; role?: UserRole }): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      await authApi.updateEmployee(id, body);
      await load();
    } catch (err) {
      setErrors(err instanceof ApiError ? err.errors : ['העדכון נכשל.']);
    } finally {
      setBusy(false);
    }
  }

  if (users === null) return <Card><p className="muted">טוען…</p></Card>;

  return (
    <>
      <Card>
        <div className="card-title">
          <h2>עובדים</h2>
          <Tag kind="muted">{users.length}</Tag>
        </div>

        {errors.length > 0 && <Notice kind="error">{errors.join(' ')}</Notice>}

        {!isOwner && (
          <Notice kind="info">רק בעל העסק רשאי להוסיף עובדים או לשנות הרשאות.</Notice>
        )}

        {isOwner && access.level !== 'full' && (
          <Notice kind="warn">
            הוספת עובדים אינה אפשרית כרגע: {access.reason}
          </Notice>
        )}

        {isOwner && (
          <button type="button" className="btn btn-primary" disabled={access.level !== 'full'}
            onClick={() => setOpen(true)}>
            + הוספת עובד
          </button>
        )}
      </Card>

      {users.map((u) => (
        <Card key={u.id}>
          <div className="card-title">
            <h3>{u.name}</h3>
            <Tag kind={u.role === 'owner' ? 'ok' : 'muted'}>{ROLE_LABEL[u.role]}</Tag>
            {u.id === user?.id && <Tag kind="muted">זה אני</Tag>}
          </div>
          <p className="small muted wrap-anywhere">{u.email}</p>
          {u.licenseNumber && <p className="small muted">רישיון: {u.licenseNumber}</p>}

          {isOwner && u.id !== user?.id && (
            <div className="row mt-2">
              <Field label="תפקיד" htmlFor={`role-${u.id}`}>
                <select id={`role-${u.id}`} value={u.role} disabled={busy}
                  onChange={(e) => void patch(u.id, { role: e.target.value as UserRole })}>
                  <option value="exterminator">{ROLE_LABEL.exterminator}</option>
                  <option value="field">{ROLE_LABEL.field}</option>
                </select>
              </Field>
              <div className="field">
                <span className="field-label">גישה</span>
                <button type="button" className="btn btn-ghost" disabled={busy}
                  onClick={() => void patch(u.id, { status: 'disabled' })}>
                  נטרול גישה
                </button>
              </div>
            </div>
          )}
        </Card>
      ))}

      <Dialog
        open={open}
        title="עובד חדש"
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>ביטול</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void create()}>
              {busy ? 'שומר…' : 'הוספה'}
            </button>
          </>
        }
      >
        <Field label="שם העובד" htmlFor="emp-name">
          <input id="emp-name" type="text" value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="דוא״ל" htmlFor="emp-email" hint="ישמש לכניסה שלו למערכת.">
          <input id="emp-email" type="email" value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
        </Field>
        <Field label="תפקיד" htmlFor="emp-role" hint={ROLE_HINT[draft.role]}>
          <select id="emp-role" value={draft.role}
            onChange={(e) => setDraft({ ...draft, role: e.target.value as UserRole })}>
            <option value="exterminator">{ROLE_LABEL.exterminator}</option>
            <option value="field">{ROLE_LABEL.field}</option>
          </select>
        </Field>
        <Field label="מספר רישיון" htmlFor="emp-license">
          <input id="emp-license" type="text" value={draft.licenseNumber}
            onChange={(e) => setDraft({ ...draft, licenseNumber: e.target.value })} />
        </Field>
        <Field label="סיסמה ראשונית" htmlFor="emp-password" hint="לפחות 8 תווים, אות וספרה. יש למסור אותה לעובד.">
          <input id="emp-password" type="text" value={draft.password}
            onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
        </Field>
      </Dialog>
    </>
  );
}
