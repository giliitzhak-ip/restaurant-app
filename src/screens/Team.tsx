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
  const [draft, setDraft] = useState({
    name: '', email: '', role: 'exterminator' as UserRole, licenseNumber: '',
  });
  /** קישור חד-פעמי שנוצר כרגע. מוצג פעם אחת, ואינו נשמר באפליקציה. */
  const [link, setLink] = useState<{ url: string; expiresAt: string; kind: 'invite' | 'reset'; who: string } | null>(null);
  const [copied, setCopied] = useState(false);

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

  const linkUrl = (path: string) =>
    `${window.location.origin}${window.location.pathname}${path}`;

  /**
   * הזמנת עובד. בעל העסק אינו קובע ואינו רואה סיסמה: נוצר קישור
   * חד-פעמי שהעובד פותח וקובע בו את הסיסמה שלו.
   */
  async function invite(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setErrors([]);
    try {
      const res = await authApi.inviteEmployee(draft);
      setLink({
        url: linkUrl(res.path), expiresAt: res.expiresAt, kind: 'invite', who: draft.name,
      });
      setDraft({ name: '', email: '', role: 'exterminator', licenseNumber: '' });
      setOpen(false);
      await load();
    } catch (err) {
      setErrors(err instanceof ApiError ? err.errors : ['ההזמנה נכשלה.']);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(id: string, who: string): Promise<void> {
    if (busy) return;
    setBusy(true);
    setErrors([]);
    try {
      const res = await authApi.resetEmployeePassword(id);
      setLink({ url: linkUrl(res.path), expiresAt: res.expiresAt, kind: 'reset', who });
      await load();
    } catch (err) {
      setErrors(err instanceof ApiError ? err.errors : ['איפוס הסיסמה נכשל.']);
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
            + הזמנת עובד
          </button>
        )}

        {link && (
          <Notice
            kind="info"
            title={link.kind === 'invite'
              ? `קישור הזמנה עבור ${link.who}`
              : `קישור לאיפוס סיסמה עבור ${link.who}`}
          >
            <div className="small wrap-anywhere invite-link">{link.url}</div>
            <div className="small muted mt-2">
              יש להעביר את הקישור לעובד. הוא קובע את הסיסמה בעצמו, והקישור
              פעיל עד {new Date(link.expiresAt).toLocaleDateString('he-IL')} ומתבטל
              אחרי שימוש אחד. הקישור מוצג כאן פעם אחת בלבד.
            </div>
            <div className="row mt-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(link.url);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? 'הועתק' : 'העתק קישור'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLink(null)}>
                סיימתי
              </button>
            </div>
          </Notice>
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
              <div className="field">
                <span className="field-label">סיסמה</span>
                <button type="button" className="btn btn-ghost" disabled={busy}
                  onClick={() => void resetPassword(u.id, u.name)}>
                  איפוס סיסמה
                </button>
              </div>
            </div>
          )}
        </Card>
      ))}

      <Dialog
        open={open}
        title="הזמנת עובד"
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>ביטול</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void invite()}>
              {busy ? 'יוצר…' : 'צור קישור הזמנה'}
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
        <Notice kind="info">
          לא נקבעת כאן סיסמה. בסיום ייווצר קישור חד-פעמי להעברה לעובד,
          והוא יקבע את הסיסמה שלו בעצמו.
        </Notice>
      </Dialog>
    </>
  );
}
