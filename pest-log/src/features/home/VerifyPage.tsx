import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, PoisonNotice } from '@/components/Common';
import { searchLogs, type ArchiveLogRow } from '@/lib/repo';
import { formatDateTimeHe } from '@/lib/time';

/**
 * אימות עותק: נפתח מסריקת ה-QR שב-PDF.
 * מציג רק את פרטי האימות (מספר סידורי, גרסה, מועד השלמה, התאמת טביעת
 * האצבע) — לא את תוכן היומן — ודורש התחברות, כמו כל מסך אחר.
 */
export function VerifyPage(): React.JSX.Element {
  const [params] = useSearchParams();
  const logId = params.get('log') ?? '';
  const hashPrefix = params.get('h') ?? '';
  const [row, setRow] = useState<ArchiveLogRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const rows = await searchLogs({ status: 'completed', limit: 200 });
        setRow(rows.find((candidate) => candidate.id === logId) ?? null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setLoading(false);
      }
    })();
  }, [logId]);

  const matches = Boolean(row?.documentHash && hashPrefix && row.documentHash.startsWith(hashPrefix));

  return (
    <>
      <PoisonNotice />
      <section className="card">
        <h2>אימות עותק יומן</h2>

        {loading ? <p className="muted">בודק…</p> : null}
        {error ? <Alert kind="error">{error}</Alert> : null}

        {!loading && !row ? (
          <Alert kind="warning" title="היומן לא נמצא">
            לא נמצא יומן מתאים בארגון שלך. ייתכן שהעותק שייך לעסק אחר, או שהיומן נמחק לאחר תקופת השמירה.
          </Alert>
        ) : null}

        {row ? (
          <>
            <Alert kind={matches ? 'success' : 'error'} title={matches ? 'העותק תואם ליומן השמור' : 'טביעת האצבע אינה תואמת'}>
              {matches
                ? 'טביעת האצבע שבעותק זהה לזו של המסמך השמור במערכת.'
                : 'טביעת האצבע שבעותק אינה תואמת למסמך השמור. ייתכן שמדובר בגרסה אחרת של היומן.'}
            </Alert>

            <div className="field">
              <span className="field-label">מספר סידורי</span>
              <div>{row.serialNumber}</div>
            </div>
            <div className="field">
              <span className="field-label">גרסת מסמך</span>
              <div>{row.documentVersion}</div>
            </div>
            <div className="field">
              <span className="field-label">מועד השלמה</span>
              <div>{row.completedAt ? formatDateTimeHe(row.completedAt) : '—'}</div>
            </div>
            <div className="field">
              <span className="field-label">טביעת אצבע מלאה</span>
              <div className="mono small dim" style={{ wordBreak: 'break-all' }}>
                {row.documentHash}
              </div>
            </div>
          </>
        ) : null}
      </section>
    </>
  );
}
