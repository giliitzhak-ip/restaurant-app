import { useState } from 'react';
import { Notice } from './ui';
import { authApi } from '../lib/authClient';
import { STANDALONE } from '../lib/config';

/**
 * קישור מסמך ללקוח.
 *
 * הקישור מוגן באסימון אקראי עם תוקף, ולא בניחוש מזהה היומן.
 * הוא נוצר רק ליומן שהושלם, אפשר לבטל אותו, ומספר הצפיות מוצג –
 * כדי שיהיה אפשר לדעת אם הלקוח פתח את המסמך.
 */
export function CustomerLink({ journalId, enabled }: { journalId: string; enabled: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [expires, setExpires] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoked, setRevoked] = useState(false);

  // בבנייה ללא שרת אין למי לפנות, ולכן אין להציג כפתור שלא יעבוד
  if (STANDALONE) return null;

  async function create(): Promise<void> {
    setBusy(true);
    setError(null);
    setRevoked(false);
    try {
      const res = await authApi.createDocLink(journalId, 30);
      setUrl(`${window.location.origin}${window.location.pathname}${res.path}`);
      setExpires(res.expiresAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'יצירת הקישור נכשלה.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await authApi.revokeDocLinks(journalId);
      setUrl(null);
      setExpires(null);
      setRevoked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ביטול הקישור נכשל.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <div className="row">
        <button
          type="button"
          className="btn btn-soft"
          disabled={busy || !enabled}
          onClick={() => void create()}
        >
          {url ? 'צור קישור חדש' : 'קישור מוגן ללקוח'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => void revoke()}
        >
          בטל קישורים
        </button>
      </div>

      {!enabled && (
        <div className="hint">
          אפשר לשלוח קישור רק אחרי סיום היומן, כדי שהלקוח לא יקבל מסמך שעוד ישתנה.
        </div>
      )}

      {error && <Notice kind="error">{error}</Notice>}
      {revoked && <Notice kind="info">הקישורים שנשלחו ללקוח בוטלו ואינם נפתחים יותר.</Notice>}

      {url && (
        <Notice kind="info" title="הקישור נוצר">
          <div className="small wrap-anywhere">{url}</div>
          <div className="small muted mt-2">
            פעיל עד {expires ? new Date(expires).toLocaleDateString('he-IL') : ''}.
            הקישור מציג את המסמך הסופי בלבד, ואינו נותן גישה לשאר היומנים.
          </div>
          <div className="row mt-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                void navigator.clipboard?.writeText(url);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? 'הועתק' : 'העתק קישור'}
            </button>
          </div>
        </Notice>
      )}
    </div>
  );
}
