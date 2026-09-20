import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/state/AppContext';
import { Alert, EmptyState, PoisonNotice } from '@/components/Common';
import { cachedArchive, filterLogsByText, searchLogs, type ArchiveLogRow } from '@/lib/repo';
import { formatDateTimeHe } from '@/lib/time';
import { isApiError, openCorrection, requestPdf } from '@/lib/api';
import { idempotencyKey, newUuid } from '@/lib/ids';
import { putDraft } from '@/lib/db/idb';
import { duplicateLogContent } from './duplicate';
import { LOG_STATUS_LABELS } from '@/schema/enums';

/** ארכיון היומנים: חיפוש, PDF, שכפול ופתיחת גרסת תיקון. */
export function ArchivePage(): React.JSX.Element {
  const navigate = useNavigate();
  const { profile } = useApp();
  const [rows, setRows] = useState<ArchiveLogRow[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'draft' | 'completed' | 'cancelled'>('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ kind: 'error' | 'success' | 'info'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await searchLogs(statusFilter ? { status: statusFilter } : {});
      setRows(result);
    } catch {
      // ללא קליטה — מציגים את המטמון המקומי.
      const cached = await cachedArchive();
      setRows(cached);
      setMessage({ kind: 'info', text: 'אין חיבור לרשת — מוצגים היומנים שנשמרו במכשיר.' });
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => filterLogsByText(rows, query), [rows, query]);

  const handlePdf = async (row: ArchiveLogRow) => {
    setBusyId(row.id);
    setMessage(null);
    try {
      const result = await requestPdf(row.id);
      if (isApiError(result)) {
        setMessage({ kind: 'error', text: result.message });
        return;
      }
      // הקישור חתום וקצר-מועד. נפתח בלשונית חדשה להורדה או הדפסה.
      globalThis.open(result.signedUrl, '_blank', 'noopener,noreferrer');
    } finally {
      setBusyId(null);
    }
  };

  const handleDuplicate = async (row: ArchiveLogRow) => {
    if (!profile) return;
    setBusyId(row.id);
    try {
      const source = (row.snapshot ?? row.content) as Record<string, unknown>;
      const { content, clearedFields } = duplicateLogContent(source);
      const newId = newUuid();
      await putDraft({
        id: newId,
        organizationId: profile.organizationId,
        content,
        serverVersion: null,
        idempotencyKey: idempotencyKey('upsert_draft', newId, 'duplicate'),
        updatedAt: new Date().toISOString(),
        syncedAt: null,
        syncState: 'local',
        lastError: null,
        syncedFingerprint: null,
        readOnly: false,
        serialNumber: null,
        status: 'draft',
      });
      navigate(`/logs/${newId}`, { state: { clearedFields } });
    } finally {
      setBusyId(null);
    }
  };

  const handleCorrection = async (row: ArchiveLogRow) => {
    const reason = globalThis.prompt(
      'מהי סיבת התיקון? היומן המקורי יישמר כמו שהוא, ותיפתח גרסת תיקון מקושרת.',
    );
    if (!reason || reason.trim().length < 3) return;

    setBusyId(row.id);
    setMessage(null);
    try {
      const result = await openCorrection(row.id, reason.trim(), idempotencyKey('correct_log', row.id, reason.slice(0, 12)));
      if (isApiError(result)) {
        setMessage({ kind: 'error', text: result.message });
        return;
      }
      navigate(`/logs/${result.correctionLogId}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PoisonNotice />

      <section className="card">
        <h2>ארכיון יומנים</h2>

        <div className="field-row">
          <div className="field">
            <label htmlFor="archive-search">חיפוש</label>
            <input
              id="archive-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="מספר סידורי, שם מזמין, כתובת, תכשיר, מזיק…"
            />
          </div>
          <div className="field">
            <label htmlFor="archive-status">סטטוס</label>
            <select
              id="archive-status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            >
              <option value="">הכול</option>
              <option value="draft">טיוטות</option>
              <option value="completed">הושלמו</option>
              <option value="cancelled">בוטלו</option>
            </select>
          </div>
        </div>

        {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}

        {loading ? <p className="muted">טוען…</p> : null}

        {!loading && visible.length === 0 ? <EmptyState>לא נמצאו יומנים.</EmptyState> : null}

        {visible.map((row) => (
          <article className="repeat-item" key={row.id}>
            <div className="repeat-item-head">
              <h4>
                {row.serialNumber ? `יומן מס׳ ${row.serialNumber}` : 'טיוטה'}
                {row.documentVersion > 1 ? ` · גרסה ${row.documentVersion}` : ''}
              </h4>
              <span className={`tag ${row.status === 'completed' ? 'tag-success' : row.status === 'cancelled' ? 'tag-danger' : 'tag-brand'}`}>
                {LOG_STATUS_LABELS[row.status]}
              </span>
            </div>

            <div className="small muted">
              {row.completedAt ? `הושלם: ${formatDateTimeHe(row.completedAt)}` : `עודכן: ${formatDateTimeHe(row.updatedAt)}`}
            </div>
            {row.correctionReason ? (
              <div className="small muted">סיבת התיקון: {row.correctionReason}</div>
            ) : null}
            {row.documentHash ? (
              <div className="small dim mono" title="טביעת אצבע של המסמך">
                {row.documentHash.slice(0, 24)}…
              </div>
            ) : null}

            <div className="btn-row" style={{ marginTop: '0.6rem' }}>
              {row.status === 'draft' ? (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => navigate(`/logs/${row.id}`)}>
                  המשך מילוי
                </button>
              ) : null}
              {row.status === 'completed' ? (
                <>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={busyId === row.id}
                    onClick={() => void handlePdf(row)}
                  >
                    {busyId === row.id ? 'מפיק…' : 'פתיחת PDF'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={busyId === row.id}
                    onClick={() => void handleCorrection(row)}
                  >
                    פתיחת גרסת תיקון
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="btn btn-sm"
                disabled={busyId === row.id}
                onClick={() => void handleDuplicate(row)}
              >
                שכפול ליומן חדש
              </button>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
