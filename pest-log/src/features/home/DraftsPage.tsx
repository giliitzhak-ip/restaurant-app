import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/state/AppContext';
import { Alert, EmptyState, PoisonNotice } from '@/components/Common';
import { SkeletonList } from '@/components/Skeleton';
import { listDrafts, type StoredDraft } from '@/lib/db/idb';
import { searchLogs, type ArchiveLogRow } from '@/lib/repo';
import { formatDateTimeHe } from '@/lib/time';
import { SYNC_STATE_LABELS } from '@/schema/enums';
import { newUuid } from '@/lib/ids';

/**
 * טיוטות פתוחות — מהמכשיר ומהשרת.
 * טיוטה שנוצרה במכשיר אחר מוצגת גם היא, כדי שלא "תיעלם" למשתמש.
 */
export function DraftsPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { profile, syncStatus } = useApp();
  const [local, setLocal] = useState<StoredDraft[]>([]);
  const [remote, setRemote] = useState<ArchiveLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const drafts = (await listDrafts()).filter((draft) => draft.status === 'draft');
    setLocal(drafts);

    try {
      const serverDrafts = await searchLogs({ status: 'draft' });
      const localIds = new Set(drafts.map((draft) => draft.id));
      setRemote(serverDrafts.filter((row) => !localIds.has(row.id)));
      setOffline(false);
    } catch {
      setRemote([]);
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, syncStatus.lastSyncedAt]);

  const ordererName = (content: Record<string, unknown>): string => {
    const orderer = content.orderer as Record<string, unknown> | undefined;
    return typeof orderer?.name === 'string' && orderer.name.trim().length > 0 ? orderer.name : 'ללא שם מזמין';
  };

  return (
    <>
      <PoisonNotice />

      <section className="card">
        <div className="spread">
          <h2 style={{ margin: 0 }}>טיוטות</h2>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => navigate(`/logs/${newUuid()}`)}
            disabled={!profile}
          >
            + יומן חדש
          </button>
        </div>
        <p className="card-sub">יומנים שטרם הושלמו. ניתן להמשיך למלא אותם בכל עת.</p>

        {offline ? <Alert kind="info">אין חיבור לרשת — מוצגות הטיוטות ששמורות במכשיר.</Alert> : null}

        {loading ? <SkeletonList rows={3} /> : null}

        {!loading && local.length === 0 && remote.length === 0 ? (
          <EmptyState>אין טיוטות פתוחות.</EmptyState>
        ) : null}

        {local.map((draft) => (
          <button
            key={draft.id}
            type="button"
            className="repeat-item"
            style={{ width: '100%', textAlign: 'right', cursor: 'pointer' }}
            onClick={() => navigate(`/logs/${draft.id}`)}
          >
            <div className="spread">
              <strong>{ordererName(draft.content as Record<string, unknown>)}</strong>
              <span className={`tag ${draft.syncState === 'error' ? 'tag-danger' : 'tag-brand'}`}>
                {SYNC_STATE_LABELS[draft.syncState]}
              </span>
            </div>
            <div className="small muted">עודכן: {formatDateTimeHe(draft.updatedAt)}</div>
            {draft.lastError ? <div className="small" style={{ color: 'var(--danger-ink)' }}>{draft.lastError}</div> : null}
          </button>
        ))}

        {remote.map((row) => (
          <button
            key={row.id}
            type="button"
            className="repeat-item"
            style={{ width: '100%', textAlign: 'right', cursor: 'pointer' }}
            onClick={() => navigate(`/logs/${row.id}`)}
          >
            <div className="spread">
              <strong>{ordererName(row.content)}</strong>
              <span className="tag">ממכשיר אחר</span>
            </div>
            <div className="small muted">עודכן: {formatDateTimeHe(row.updatedAt)}</div>
          </button>
        ))}
      </section>
    </>
  );
}
