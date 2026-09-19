import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Alert, PoisonNotice } from '@/components/Common';
import { isApiError, recordDelivery, requestPdf } from '@/lib/api';
import { HANDOVER_METHOD_LABELS, type HandoverMethod } from '@/schema/enums';

/**
 * מסך אישור לאחר השלמת יומן: המספר הסידורי, טביעת האצבע, וה-PDF.
 *
 * הערה על שיתוף: כפתור השיתוף פותח את תפריט השיתוף של המכשיר עם קישור
 * חתום וקצר-מועד ל-PDF. הוא אינו "שולח PDF ב-SMS" — הודעת טקסט אינה
 * יכולה לשאת קובץ, והקישור הוא מה שנשלח בפועל.
 */
export function CompletedPage(): React.JSX.Element {
  const { logId } = useParams<{ logId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as { serialNumber?: number; documentHash?: string; signedUrl?: string };

  const [signedUrl, setSignedUrl] = useState(state.signedUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success' | 'info'; text: string } | null>(null);

  const refreshUrl = async (): Promise<string | null> => {
    const result = await requestPdf(logId ?? '');
    if (isApiError(result)) {
      setMessage({ kind: 'error', text: result.message });
      return null;
    }
    setSignedUrl(result.signedUrl);
    return result.signedUrl;
  };

  const openPdf = async () => {
    setBusy(true);
    try {
      // הקישור חתום לזמן קצר; אם פג — מייצרים חדש.
      const url = signedUrl || (await refreshUrl());
      if (url) globalThis.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setBusy(false);
    }
  };

  const share = async (method: HandoverMethod) => {
    setBusy(true);
    setMessage(null);
    try {
      const url = signedUrl || (await refreshUrl());
      if (!url) return;

      const text = `יומן ביצוע הדברה מס׳ ${state.serialNumber ?? ''} — קישור לצפייה ולהורדה (תקף לזמן מוגבל): ${url}`;

      if (method === 'whatsapp') {
        globalThis.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
      } else if (navigator.share) {
        await navigator.share({ title: 'יומן ביצוע הדברה', text });
      } else {
        await navigator.clipboard.writeText(text);
        setMessage({ kind: 'success', text: 'הקישור הועתק. ניתן להדביק אותו בהודעה או בדוא״ל.' });
      }

      const recorded = await recordDelivery(logId ?? '', method);
      if (!isApiError(recorded)) {
        setMessage({ kind: 'success', text: 'המסירה תועדה ביומן הביקורת.' });
      }
    } catch {
      setMessage({ kind: 'info', text: 'השיתוף בוטל.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PoisonNotice />

      <section className="card">
        <h2>היומן הושלם ונעול</h2>
        <p className="card-sub">
          מרגע ההשלמה לא ניתן לשנות או למחוק את היומן. לתיקון יש להפיק גרסת תיקון מקושרת מהארכיון.
        </p>

        {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}

        <div className="field">
          <span className="field-label">מספר סידורי</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--gold)' }}>{state.serialNumber ?? '—'}</div>
        </div>

        {state.documentHash ? (
          <div className="field">
            <span className="field-label">טביעת אצבע של המסמך (SHA-256)</span>
            <div className="mono small dim" style={{ wordBreak: 'break-all' }}>
              {state.documentHash}
            </div>
          </div>
        ) : null}

        <div className="btn-row">
          <button type="button" className="btn btn-primary" onClick={() => void openPdf()} disabled={busy}>
            פתיחת ה-PDF / הדפסה
          </button>
          <button type="button" className="btn" onClick={() => void share('whatsapp')} disabled={busy}>
            שליחה בוואטסאפ
          </button>
          <button type="button" className="btn" onClick={() => void share('email')} disabled={busy}>
            {HANDOVER_METHOD_LABELS.email}
          </button>
        </div>

        <p className="small dim" style={{ marginTop: '0.6rem' }}>
          השיתוף שולח קישור חתום וקצר-מועד לקובץ, ולא את הקובץ עצמו בהודעת טקסט.
        </p>

        <div className="btn-row" style={{ marginTop: '0.8rem' }}>
          <button type="button" className="btn" onClick={() => navigate('/archive')}>
            לארכיון
          </button>
          <button type="button" className="btn" onClick={() => navigate('/')}>
            למסך הבית
          </button>
        </div>
      </section>
    </>
  );
}
