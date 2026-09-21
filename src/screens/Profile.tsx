import { useStore } from '../state/store';
import { Card, Field, Notice, Tag } from '../components/ui';
import { formatDateTime } from '../lib/format';
import type { Role } from '../types';

const ROLE_LABEL: Record<Role, string> = {
  admin: 'מנהל',
  exterminator: 'מדביר',
  field: 'עובד שטח',
};

export function ProfileScreen() {
  const { state, pendingSync, online, updateExterminator } = useStore();
  const exterminator = state.exterminators[0];
  const user = state.users.find((u) => u.id === state.currentUserId);

  /** פרטי המדביר נשמרים דרך ה-store, כך שהם נשמרים ומסונכרנים. */
  function patch(next: Partial<typeof exterminator>): void {
    if (!exterminator) return;
    updateExterminator(exterminator.id, next);
  }

  const recentAudit = state.auditLog.slice(-12).reverse();

  return (
    <>
      <Card>
        <div className="card-title">
          <h2>פרופיל המדביר</h2>
          <Tag kind="muted">{ROLE_LABEL[user?.role ?? 'exterminator']}</Tag>
        </div>
        <div className="row">
          <Field label="שם מלא" htmlFor="p-name">
            <input id="p-name" type="text" value={exterminator?.name ?? ''} onChange={(e) => patch({ name: e.target.value })} />
          </Field>
          <Field label="מספר רישיון הדברה" htmlFor="p-license" hint="ישמש כברירת מחדל ביומנים חדשים.">
            <input id="p-license" type="text" value={exterminator?.licenseNumber ?? ''} onChange={(e) => patch({ licenseNumber: e.target.value })} />
          </Field>
        </div>
        <div className="row">
          <Field label="תוקף רישיון" htmlFor="p-expiry">
            <input id="p-expiry" type="date" value={exterminator?.licenseExpiry ?? ''} onChange={(e) => patch({ licenseExpiry: e.target.value })} />
          </Field>
          <Field label="טלפון" htmlFor="p-phone">
            <input id="p-phone" type="tel" value={exterminator?.phone ?? ''} onChange={(e) => patch({ phone: e.target.value })} />
          </Field>
        </div>
      </Card>

      <Card>
        <div className="card-title"><h3>הרשאות</h3></div>
        <p className="small">
          המערכת מגדירה שלוש רמות: <span className="bold">מנהל</span> (כל הפעולות, כולל ארכוב וביטול),
          <span className="bold"> מדביר</span> (יצירת יומנים, חתימה והפקה) ו<span className="bold">עובד שטח</span> (תיעוד בלבד).
          המשתמש הנוכחי: {user?.name} · {ROLE_LABEL[user?.role ?? 'field']}.
        </p>
      </Card>

      <Card>
        <div className="card-title"><h3>סנכרון ועבודה בשטח</h3></div>
        <p className="small">
          מצב חיבור: {online ? 'מחובר' : 'לא מחובר'} · ממתינים לסנכרון: {pendingSync}.
        </p>
        <Notice kind="info">
          כל שינוי נשמר מיד במכשיר. כשאין רשת, הנתונים נשמרים בתור סנכרון ונשלחים לשרת ברגע שהחיבור חוזר.
        </Notice>
      </Card>

      <Card>
        <div className="card-title"><h3>לוג שינויים אחרון</h3></div>
        {recentAudit.length ? (
          <ul className="small">
            {recentAudit.map((a) => (
              <li key={a.id}>
                {formatDateTime(a.at)} · {a.entity} · {a.action}
                {a.field ? ` · ${a.field}` : ''} · {a.userName}
              </li>
            ))}
          </ul>
        ) : <p className="muted small">אין רישומים.</p>}
      </Card>

      <Card>
        <Notice kind="warn" title="הבהרה">
          המערכת נועדה לתיעוד עבודת ההדברה לפי הנתונים שהוזנו. אין בה אישור חוקי ואין היא קובעת
          עמידה בדרישות הדין. חובה לפעול לפי הדין, תנאי רישיון המדביר והתווית העדכנית של כל תכשיר.
        </Notice>
      </Card>
    </>
  );
}
