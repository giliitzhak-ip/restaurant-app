import { useMemo, useState } from 'react';
import { useStore } from '../../state/store';
import { Card, Dialog, Notice } from '../../components/ui';
import { SignaturePad } from '../../components/SignaturePad';
import { CustomerLink } from '../../components/CustomerLink';
import { validateJournal, blockingIssues } from '../../lib/validation';
import { JOURNAL_LOCK_REASON, isJournalLocked } from '../../lib/journalLock';
import { journalNumberText } from '../../lib/format';
import { buildShareText } from '../../lib/share';
import { normalizeIsraeliPhone, whatsappLink } from '../../lib/phone';
import { navigate } from '../../router';
import type { StepProps } from './JournalWizard';

export function Step8Signatures({ journalId, goToStep }: StepProps) {
  const {
    state, updateJournal, saveSignature, removeSignature, completeJournal, getFullJournal,
  } = useStore();
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const journal = state.journals.find((j) => j.id === journalId)!;
  const signatures = state.signatures.filter((s) => s.journalId === journalId);
  const customer = state.customers.find((c) => c.id === journal.customerId);
  const [customerName, setCustomerName] = useState(customer?.contactName || customer?.name || '');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [done, setDone] = useState(journal.status !== 'draft');
  const [submitting, setSubmitting] = useState(false);

  const full = getFullJournal(journalId);
  const issues = useMemo(() => (full ? validateJournal(full) : []), [full]);
  const blocking = blockingIssues(issues);

  const locked = isJournalLocked(journal);
  const extSig = signatures.find((s) => s.role === 'exterminator');
  const custSig = signatures.find((s) => s.role === 'customer');

  function finish(): void {
    if (submitting || blocking.length > 0) return;   // מניעת שמירה כפולה
    setSubmitting(true);
    /* השמירה הסופית מאושרת רק אם החנות סגרה את היומן בפועל.
       כך המסך לא מכריז "נשמר" כשהוולידציה בצד החנות מנעה את הסיום. */
    const closed = completeJournal(journalId);
    setDone(closed);
    setFailed(!closed);
    window.setTimeout(() => setSubmitting(false), 800);
  }

  const shareText = full ? buildShareText(full, state) : '';
  const docUrl = `${window.location.origin}${window.location.pathname}#/doc/${journalId}`;
  const phone = normalizeIsraeliPhone(customer?.phone ?? '');
  const whatsapp = whatsappLink(customer?.phone, shareText);
  /* שיתוף מקורי זמין במכשירים ניידים. בלעדיו נשארים WhatsApp,
     דוא״ל והעתקת קישור – ואין כפתור שלא יעשה דבר. */
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function shareNative(): Promise<void> {
    try {
      await navigator.share({
        title: journalNumberText(journal.journalNumber),
        text: shareText,
        url: docUrl,
      });
    } catch {
      /* המשתמש ביטל, או שהמכשיר דחה – אין מה לדווח */
    }
  }

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard?.writeText(docUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      {locked && (
        <Card>
          <Notice kind="info" title="היומן נעול">{JOURNAL_LOCK_REASON}</Notice>
        </Card>
      )}

      <Card>
        <div className="card-title"><h2>חתימות וסיום</h2></div>

        <SignaturePad
          label={`חתימת המדביר · ${journal.exterminatorName || '—'}`}
          value={extSig?.image}
          readOnly={locked}
          onChange={(img) => {
            // ניקוי החתימה מוחק את הרשומה, ואינו מותיר חתימה ישנה
            if (!img) { removeSignature(journalId, 'exterminator'); return; }
            saveSignature({
              journalId, role: 'exterminator', signerName: journal.exterminatorName,
              image: img, signedAt: new Date().toISOString(),
            });
          }}
        />

        <div className="field">
          <label htmlFor="cust-signer">שם החותם מטעם הלקוח</label>
          <input
            id="cust-signer"
            type="text"
            value={customerName}
            disabled={locked}
            onChange={(e) => setCustomerName(e.target.value)}
          />
        </div>

        <SignaturePad
          label="חתימת הלקוח"
          value={custSig?.image}
          readOnly={locked}
          onChange={(img) => {
            if (!img) { removeSignature(journalId, 'customer'); return; }
            saveSignature({
              journalId, role: 'customer', signerName: customerName,
              image: img, signedAt: new Date().toISOString(),
            });
          }}
        />

        <label className="check-line">
          <input
            type="checkbox"
            checked={journal.customerAcknowledged}
            disabled={locked}
            onChange={(e) => updateJournal(journalId, { customerAcknowledged: e.target.checked })}
          />
          הלקוח קיבל את ההנחיות והוסברו לו
        </label>
      </Card>

      {blocking.length > 0 && (
        <Card>
          <Notice kind="warn" title={`${blocking.length} פריטים חסרים לסיום היומן`}>
            <ul>
              {blocking.map((issue) => (
                <li key={issue.field}>
                  {issue.message}{' '}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => goToStep(issue.step)}>
                    לשלב {issue.step}
                  </button>
                </li>
              ))}
            </ul>
            הטיוטה נשמרת בכל מקרה – אפשר להשלים מאוחר יותר.
          </Notice>
        </Card>
      )}

      <Card>
        <div className="card-title"><h3>סיום והפקה</h3></div>

        {failed && (
          <Notice kind="error" title="היומן לא נסגר">
            חסרים נתונים לסיום היומן, או שהיומן נעול. הטיוטה נשמרה כפי שהיא.
          </Notice>
        )}

        {done && (
          <div className="mb-3">
            <div className="success-check" aria-hidden="true">✓</div>
            <p className="bold" style={{ textAlign: 'center' }} role="status">
              {journalNumberText(journal.journalNumber)} נשמר.
            </p>
          </div>
        )}

        <div className="stack">
          <button type="button" className="btn btn-ghost" onClick={() => setPreviewOpen(true)}>
            תצוגה מקדימה
          </button>

          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={blocking.length > 0 || done || submitting}
            onClick={finish}
          >
            {done ? 'היומן הושלם' : 'שמירה סופית'}
          </button>

          <button type="button" className="btn btn-deep" onClick={() => navigate(`#/doc/${journalId}`)}>
            מסמך היומן · הפקת PDF והדפסה
          </button>

          <div className="row">
            {whatsapp ? (
              <a className="btn btn-soft" href={whatsapp} target="_blank" rel="noreferrer">
                שיתוף ב-WhatsApp
              </a>
            ) : (
              <span className="small muted">
                אין מספר טלפון תקין ללקוח – {phone.reason ?? 'יש להשלים בכרטיס הלקוח'}.
              </span>
            )}
            {customer?.email ? (
              <a
                className="btn btn-soft"
                href={`mailto:${customer.email}?subject=${encodeURIComponent(journalNumberText(journal.journalNumber))}&body=${encodeURIComponent(shareText)}`}
              >
                שליחה בדוא״ל
              </a>
            ) : (
              <span className="small muted">אין דוא״ל ללקוח.</span>
            )}
            {canShare && (
              <button type="button" className="btn btn-soft" onClick={() => void shareNative()}>
                שיתוף במכשיר
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={() => void copyLink()}>
              {copied ? 'הקישור הועתק' : 'העתק קישור למסמך'}
            </button>
          </div>
        </div>

        <CustomerLink journalId={journalId} enabled={done || locked} />

        <Notice kind="info">
          שיתוף אינו משנה את מצב היומן. סימון "נשלח" נשמר לפעולה מתועדת,
          ואינו נגזר מפתיחת WhatsApp או מהעתקת קישור.
        </Notice>

        <Notice kind="info">
          המערכת מתעדת את העבודה לפי הנתונים שהוזנו. האחריות לפעול לפי הדין, תנאי הרישיון
          והתווית העדכנית של כל תכשיר היא של המדביר.
        </Notice>
      </Card>

      <Dialog open={previewOpen} title="תצוגה מקדימה" onClose={() => setPreviewOpen(false)}>
        <pre className="small wrap-anywhere" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
          {shareText}
        </pre>
      </Dialog>
    </>
  );
}
