import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/state/AppContext';
import { Alert, EmptyState, PoisonNotice, SyncBadge } from '@/components/Common';
import { listDrafts, type StoredDraft } from '@/lib/db/idb';
import { newUuid } from '@/lib/ids';
import { formatDateTimeHe } from '@/lib/time';
import { SYNC_STATE_LABELS } from '@/schema/enums';

/** מסך הבית: פתיחת יומן חדש, המשך טיוטות וסטטוס סנכרון. */
export function HomePage(): React.JSX.Element {
  const navigate = useNavigate();
  const { profile, syncStatus, syncEngine } = useApp();
  const [drafts, setDrafts] = useState<StoredDraft[]>([]);

  useEffect(() => {
    void listDrafts().then((all) => setDrafts(all.filter((draft) => draft.status === 'draft')));
  }, [syncStatus.lastSyncedAt]);

  return (
    <>
      <PoisonNotice />

      <section className="card">
        <div className="spread">
          <div>
            <h2 style={{ margin: 0 }}>שלום {profile?.fullName ?? ''}</h2>
            <p className="muted small" style={{ margin: 0 }}>
              {profile?.organizationName}
            </p>
          </div>
          <SyncBadge state={syncStatus.state} pendingCount={syncStatus.pendingCount} isOnline={syncStatus.isOnline} />
        </div>

        {syncStatus.failedCount > 0 ? (
          <Alert kind="error" title={`${syncStatus.failedCount} פעולות לא סונכרנו`}>
            {syncStatus.lastError ?? 'אירעה שגיאה בסנכרון.'}
            <div className="btn-row" style={{ marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-sm" onClick={() => void syncEngine.retryFailed()}>
                ניסיון חוזר
              </button>
            </div>
          </Alert>
        ) : null}

        {!syncStatus.isOnline ? (
          <Alert kind="info">
            אין חיבור לרשת. אפשר להמשיך לעבוד — הכול נשמר במכשיר ויסונכרן אוטומטית כשהחיבור יחזור.
          </Alert>
        ) : null}

        <button type="button" className="btn btn-primary btn-block" onClick={() => navigate(`/logs/${newUuid()}`)}>
          + יומן הדברה חדש
        </button>
      </section>

      <section className="card">
        <h3>טיוטות פתוחות</h3>
        {drafts.length === 0 ? (
          <EmptyState>אין טיוטות פתוחות.</EmptyState>
        ) : (
          drafts.map((draft) => {
            const orderer = (draft.content as Record<string, Record<string, unknown>>).orderer;
            const name = typeof orderer?.name === 'string' ? orderer.name : 'ללא שם מזמין';
            return (
              <button
                key={draft.id}
                type="button"
                className="repeat-item"
                style={{ width: '100%', textAlign: 'right', cursor: 'pointer' }}
                onClick={() => navigate(`/logs/${draft.id}`)}
              >
                <div className="spread">
                  <strong>{name}</strong>
                  <span className={`tag ${draft.syncState === 'error' ? 'tag-danger' : 'tag-gold'}`}>
                    {SYNC_STATE_LABELS[draft.syncState]}
                  </span>
                </div>
                <div className="small muted">עודכן: {formatDateTimeHe(draft.updatedAt)}</div>
              </button>
            );
          })
        )}
      </section>
    </>
  );
}
