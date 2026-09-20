import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '@/state/AppContext';
import { useToast } from '@/state/ToastContext';
import { Alert, PoisonNotice, SyncBadge } from '@/components/Common';
import { clearLocalData } from '@/lib/db/idb';
import { signOut } from '@/lib/supabase';
import { RETENTION_YEARS } from '@/schema/enums';
import { formatDateTimeHe, getServerTimeOffset, hasSignificantClockDrift } from '@/lib/time';

/** הגדרות: סנכרון, נתוני ייחוס, פרטיות ויציאה. */
export function SettingsPage(): React.JSX.Element {
  const { profile, syncStatus, syncEngine, reference, refreshReference } = useApp();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const syncNow = async () => {
    setBusy(true);
    try {
      await syncEngine.flush();
      await refreshReference();
      showToast('הסנכרון הושלם', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'הסנכרון נכשל', 'error', {
        label: 'נסה שוב',
        onClick: () => void syncNow(),
      });
    } finally {
      setBusy(false);
    }
  };

  const retryFailed = async () => {
    setBusy(true);
    try {
      await syncEngine.retryFailed();
      showToast('הפעולות שנכשלו נשלחו מחדש', 'success');
    } finally {
      setBusy(false);
    }
  };

  const signOutAndClear = async () => {
    const confirmed = globalThis.confirm(
      'יציאה תמחק מהמכשיר את הטיוטות שטרם סונכרנו. להמשיך?',
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await clearLocalData();
      await signOut();
      globalThis.location.assign('/');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PoisonNotice />

      <section className="card">
        <h2>הגדרות</h2>

        <div className="field">
          <span className="field-label">העסק</span>
          <div>{profile?.organizationName ?? '—'}</div>
        </div>

        <div className="field">
          <span className="field-label">מצב סנכרון</span>
          <div className="row">
            <SyncBadge
              state={syncStatus.state}
              pendingCount={syncStatus.pendingCount}
              isOnline={syncStatus.isOnline}
            />
            {syncStatus.lastSyncedAt ? (
              <span className="small muted">סונכרן לאחרונה: {formatDateTimeHe(syncStatus.lastSyncedAt)}</span>
            ) : null}
          </div>
        </div>

        {syncStatus.failedCount > 0 ? (
          <Alert kind="error" title={`${syncStatus.failedCount} פעולות לא סונכרנו`}>
            {syncStatus.lastError ?? 'אירעה שגיאה בסנכרון.'}
          </Alert>
        ) : null}

        {hasSignificantClockDrift() ? (
          <Alert kind="warning" title="שעון המכשיר אינו מסונכרן">
            נמצא פער של כ-{Math.round(getServerTimeOffset() / 60000)} דקות מול שעון השרת. מועד ההשלמה של
            יומן נקבע תמיד לפי שעון השרת.
          </Alert>
        ) : null}

        <div className="btn-row">
          <button type="button" className="btn btn-primary" onClick={() => void syncNow()} disabled={busy}>
            סנכרן עכשיו
          </button>
          {syncStatus.failedCount > 0 ? (
            <button type="button" className="btn" onClick={() => void retryFailed()} disabled={busy}>
              שליחה מחדש של פעולות שנכשלו
            </button>
          ) : null}
        </div>
      </section>

      <section className="card">
        <h3>נתוני ייחוס</h3>
        <p className="card-sub">נטענים ממקור מאומת, ואינם מוטבעים בקוד.</p>
        <ul className="small" style={{ margin: 0, paddingInlineStart: '1.1rem' }}>
          <li>תכשירים: {reference.products.length}</li>
          <li>קטלוג מזיקים (נספח א׳): {reference.pestCatalog.length}</li>
          <li>תבניות אזהרה: {reference.templates.length}</li>
          <li>מזמינים: {reference.clients.length}</li>
          <li>אתרים: {reference.sites.length}</li>
        </ul>
        {reference.pestCatalog.length === 0 ? (
          <Alert kind="warning" title="קטלוג המזיקים ריק">
            יש לטעון את נספח א׳ ממקור מאומת באמצעות <span className="mono">npm run import:pest-catalog</span>.
          </Alert>
        ) : null}

        <div className="btn-row">
          <Link className="btn btn-sm" to="/bait-stations">
            תחנות האכלה
          </Link>
        </div>
      </section>

      <section className="card">
        <h3>שמירת מידע ופרטיות</h3>
        <p className="small">
          יומן שהושלם נשמר לפחות {RETENTION_YEARS} שנים ואינו ניתן לשינוי או למחיקה בתקופה זו.
        </p>
        <div className="btn-row">
          <Link className="btn btn-sm" to="/privacy">
            הודעת פרטיות
          </Link>
          <Link className="btn btn-sm" to="/import">
            ייבוא מהגרסה המקומית
          </Link>
        </div>
      </section>

      <section className="card">
        <h3>יציאה</h3>
        <p className="small muted">
          מומלץ לוודא שמצב הסנכרון הוא "מסונכרן" לפני יציאה, כדי שלא יישארו טיוטות שלא נשלחו.
        </p>
        <button type="button" className="btn btn-danger" onClick={() => void signOutAndClear()} disabled={busy}>
          יציאה מהחשבון
        </button>
      </section>
    </>
  );
}
