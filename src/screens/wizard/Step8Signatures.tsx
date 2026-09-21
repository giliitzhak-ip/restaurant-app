import { useMemo, useState } from 'react';
import { useStore } from '../../state/store';
import { Card, Dialog, Notice } from '../../components/ui';
import { SignaturePad } from '../../components/SignaturePad';
import { validateJournal, blockingIssues } from '../../lib/validation';
import { journalNumberText } from '../../lib/format';
import { buildShareText } from '../../lib/share';
import { navigate } from '../../router';
import type { StepProps } from './JournalWizard';

export function Step8Signatures({ journalId, goToStep }: StepProps) {
  const { state, updateJournal, saveSignature, completeJournal, getFullJournal } = useStore();
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

  const extSig = signatures.find((s) => s.role === 'exterminator');
  const custSig = signatures.find((s) => s.role === 'customer');

  function finish(): void {
    if (submitting || blocking.length > 0) return;   // מניעת שמירה כפולה
    setSubmitting(true);
    completeJournal(journalId);
    setDone(true);
    window.setTimeout(() => setSubmitting(false), 800);
  }

  const shareText = full ? buildShareText(full, state) : '';

  return (
    <>
      <Card>
        <div className="card-title"><h2>חתימות וסיום</h2></div>

        <SignaturePad
          label={`חתימת המדביר · ${journal.exterminatorName || '—'}`}
          value={extSig?.image}
          onChange={(img) => {
            if (!img) return;
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
            onChange={(e) => setCustomerName(e.target.value)}
          />
        </div>

        <SignaturePad
          label="חתימת הלקוח"
          value={custSig?.image}
          onChange={(img) => {
            if (!img) return;
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
            <a
              className="btn btn-soft"
              href={`https://wa.me/${(customer?.phone ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noreferrer"
            >
              שיתוף ב-WhatsApp
            </a>
            <a
              className="btn btn-soft"
              href={`mailto:${customer?.email ?? ''}?subject=${encodeURIComponent(journalNumberText(journal.journalNumber))}&body=${encodeURIComponent(shareText)}`}
            >
              שליחה בדוא״ל
            </a>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                const url = `${window.location.origin}/#/doc/${journalId}`;
                void navigator.clipboard?.writeText(url);
              }}
            >
              העתק קישור למסמך
            </button>
          </div>
        </div>

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
