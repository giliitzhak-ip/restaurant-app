import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Alert, PoisonNotice } from '@/components/Common';
import { isApiError, recordDelivery, requestPdf } from '@/lib/api';
import { HANDOVER_METHOD_LABELS, type HandoverMethod } from '@/schema/enums';
import { useApp } from '@/state/AppContext';
import { buildSmsSummary, smsHref } from '@/lib/legacy/smsSummary';
import { getSupabase } from '@/lib/supabase';
import { saveTextTemplate, collectLearnableTemplates } from '@/lib/legacy/repo';

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

  const { profile, reference, syncEngine, setTextTemplates } = useApp();
  const [signedUrl, setSignedUrl] = useState(state.signedUrl ?? '');
  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null);
  const [learned, setLearned] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success' | 'info'; text: string } | null>(null);

  /**
   * טעינת היומן שהושלם — לצורך סיכום ה-SMS ולמידת הניסוחים.
   * הלמידה היא בדיוק מה שהיה בגרסה הקודמת: כל ניסוח שהמדביר כתב נשמר
   * לפעם הבאה, ומוצע לו בספריית הניסוחים.
   */
  useEffect(() => {
    if (!logId || !profile) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await getSupabase()
          .from('pest_logs')
          .select('snapshot')
          .eq('id', logId)
          .maybeSingle();
        if (error || cancelled || !data?.snapshot) return;
        const loaded = data.snapshot as Record<string, unknown>;
        setSnapshot(loaded);

        let rows = reference.textTemplates;
        const before = rows.length;
        for (const candidate of collectLearnableTemplates(loaded)) {
          rows = await saveTextTemplate(
            syncEngine,
            rows,
            profile.organizationId,
            candidate.kind,
            candidate.body,
            'learned',
          );
        }
        if (!cancelled && rows.length !== before) {
          setTextTemplates(rows);
          setLearned(rows.length - before);
        }
      } catch {
        /* אין קליטה — נלמד בפעם הבאה שהמסך ייפתח */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logId, profile?.organizationId]);

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
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--brand-dark)' }}>{state.serialNumber ?? '—'}</div>
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

        {/* סיכום ב-SMS — הועבר מהגרסה הקודמת. */}
        {snapshot ? (
          (() => {
            const orderer = (snapshot.orderer ?? {}) as Record<string, unknown>;
            const phone =
              typeof orderer.mobile === 'string' && orderer.mobile
                ? orderer.mobile
                : typeof orderer.phone === 'string'
                  ? orderer.phone
                  : '';
            const body = buildSmsSummary({
              serialNumber: state.serialNumber ?? null,
              organizationName: profile?.organizationName ?? '',
              snapshot,
              poisonCenterPhone: profile?.poisonCenterPhone ?? '04-7771900',
              signedUrl,
            });
            const isApple = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent);
            return (
              <div className="card card-inner">
                <h3>שליחת סיכום ללקוח ב-SMS</h3>
                <p className="small muted">
                  נפתחת אפליקציית ההודעות עם סיכום היומן. הודעת טקסט אינה יכולה לשאת קובץ, ולכן הקובץ
                  עצמו אינו מצורף — אם הופק PDF, מצורף אליו קישור חתום.
                </p>
                {phone ? (
                  <a className="btn btn-primary" href={smsHref(phone, body, isApple)}>
                    פתיחת הודעה ל-{phone}
                  </a>
                ) : (
                  <p className="small dim">לא נשמר טלפון למזמין, ולכן אין למי לשלוח.</p>
                )}
                <details style={{ marginTop: '0.6rem' }}>
                  <summary className="small">תצוגת הסיכום</summary>
                  <pre className="small" style={{ whiteSpace: 'pre-wrap', margin: '0.4rem 0 0' }}>
                    {body}
                  </pre>
                </details>
              </div>
            );
          })()
        ) : null}

        {learned && learned > 0 ? (
          <Alert kind="success">{learned} ניסוחים נשמרו לספריית הניסוחים שלך לפעם הבאה.</Alert>
        ) : null}

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
