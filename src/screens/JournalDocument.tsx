import { useMemo } from 'react';
import { useStore } from '../state/store';
import { Card, EmptyState, Notice } from '../components/ui';
import { navigate } from '../router';
import { pestName } from '../data/pests';
import { computeReEntry, revealedInstructions } from './wizard/Step6Instructions';
import {
  ACTION_LABEL, JOURNAL_STATUS_LABEL, SEVERITY_LABEL, SITE_KIND_LABEL,
  VISIT_KIND_LABEL, WORK_KIND_LABEL, formatDate, formatDateTime, journalNumberText,
} from '../lib/format';
import { NOT_ENTERED } from '../types';

/**
 * מסמך היומן להדפסה ולהפקת PDF.
 * ההפקה נעשית דרך הדפסת הדפדפן ("שמור כ-PDF"), כך שהעברית נשמרת תקינה ובכיוון RTL נכון.
 */
export function JournalDocument({ journalId }: { journalId?: string }) {
  const { state, getFullJournal, labelFor } = useStore();
  const full = journalId ? getFullJournal(journalId) : null;

  const rows = useMemo(() => {
    if (!full) return [];
    return full.materials.map((jm) => {
      const material = state.materials.find((m) => m.id === jm.materialId);
      const template = state.treatmentTemplates.find((t) => t.id === jm.templateId);
      return {
        jm,
        name: material?.tradeName ?? jm.materialNameSnapshot,
        material,
        label: labelFor(jm.materialId),
        revealed: revealedInstructions(template, jm.conditionAnswers),
      };
    });
  }, [full, state.materials, state.treatmentTemplates, labelFor]);

  const reEntry = useMemo(
    () => computeReEntry(rows.map((r) => ({ name: r.name, label: r.label }))),
    [rows],
  );

  if (!full) {
    return (
      <Card>
        <EmptyState
          icon="❑"
          title="היומן לא נמצא."
          action={<button type="button" className="btn btn-primary" onClick={() => navigate('#/journals')}>לרשימת היומנים</button>}
        />
      </Card>
    );
  }

  const { journal, pests, actions, baitStations, signatures, attachments } = full;
  const customer = state.customers.find((c) => c.id === journal.customerId);
  const extSig = signatures.find((s) => s.role === 'exterminator');
  const custSig = signatures.find((s) => s.role === 'customer');

  return (
    <>
      <div className="row no-print mb-3">
        <button type="button" className="btn btn-ghost" onClick={() => navigate(`#/journal/${journal.id}/8`)}>
          חזרה ליומן
        </button>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          הדפסה / שמירה כ-PDF
        </button>
      </div>

      <div className="no-print">
        <Notice kind="info">
          להפקת PDF: לחצו "הדפסה / שמירה כ-PDF" ובחרו יעד "שמירה כ-PDF". העברית והחתימות נשמרות במסמך כפי שהן מוצגות כאן.
        </Notice>
      </div>

      <article className="doc" lang="he" dir="rtl">
        <header className="doc-head">
          <div>
            <h1>יצחק הדברות</h1>
            <div>יומן ביצוע עבודת הדברה</div>
            <div>מדביר: {journal.exterminatorName || NOT_ENTERED} · רישיון מס' {journal.licenseNumber || NOT_ENTERED}</div>
            {journal.assistantName && <div>עובד נוסף: {journal.assistantName}</div>}
          </div>
          <div style={{ textAlign: 'start' }}>
            <div><strong>{journalNumberText(journal.journalNumber)}</strong></div>
            <div>{formatDateTime(journal.startedAt)}</div>
            <div>סטטוס: {JOURNAL_STATUS_LABEL[journal.status]}</div>
          </div>
        </header>

        <h2>פרטי הלקוח והאתר</h2>
        <div className="table-scroll"><table>
          <tbody>
            <tr><th style={{ width: '26%' }}>לקוח</th><td>{customer?.name ?? NOT_ENTERED}</td>
                <th style={{ width: '18%' }}>מספר לקוח</th><td>{customer?.customerNumber ?? NOT_ENTERED}</td></tr>
            <tr><th>איש קשר</th><td>{customer?.contactName || NOT_ENTERED}</td>
                <th>טלפון</th><td>{customer?.phone || NOT_ENTERED}</td></tr>
            <tr><th>כתובת האתר</th><td colSpan={3}>{journal.siteAddress || NOT_ENTERED}</td></tr>
            <tr><th>סוג אתר</th><td>{journal.siteKind ? SITE_KIND_LABEL[journal.siteKind] : NOT_ENTERED}</td>
                <th>סוג עבודה</th><td>{WORK_KIND_LABEL[journal.workKind]}</td></tr>
            <tr><th>סוג ביקור</th><td>{VISIT_KIND_LABEL[journal.visitKind]}</td>
                <th>הערות כניסה</th><td>{journal.siteAccessNotes || '—'}</td></tr>
          </tbody>
        </table></div>

        <h2>ממצאי ניטור</h2>
        {pests.length ? (
          <div className="table-scroll"><table>
            <thead>
              <tr><th>מזיק</th><th>רמת נגיעות</th><th>אזורים</th><th>סימנים</th><th>מקור משוער</th></tr>
            </thead>
            <tbody>
              {pests.map((p) => (
                <tr key={p.id}>
                  <td>{pestName(p.pestId)}</td>
                  <td>{SEVERITY_LABEL[p.severity]}</td>
                  <td>{p.areas.join(', ') || '—'}</td>
                  <td>{p.signs.join(', ') || '—'}</td>
                  <td>{p.suspectedSource || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : <p>לא תועדו ממצאים.</p>}
        {journal.findingsNotes && <p><strong>הערות מקצועיות:</strong> {journal.findingsNotes}</p>}

        <h2>פעולות שבוצעו</h2>
        {journal.preTreatmentActions.length > 0 && (
          <p><strong>לפני שימוש בתכשיר:</strong> {journal.preTreatmentActions.join(', ')}</p>
        )}
        {actions.length ? (
          <div className="table-scroll"><table>
            <thead><tr><th>פעולה</th><th>אזורים</th><th>ציוד</th><th>הערה</th></tr></thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id}>
                  <td>{ACTION_LABEL[a.kind]}</td>
                  <td>{a.areas.join(', ') || '—'}</td>
                  <td>{a.equipment.join(', ') || '—'}</td>
                  <td>{a.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : <p>לא תועדו פעולות.</p>}

        <h2>תכשירים שבהם נעשה שימוש</h2>
        {rows.length ? (
          <div className="table-scroll"><table>
            <thead>
              <tr>
                <th>שם מסחרי</th><th>חומר פעיל</th><th>מס' רישום</th>
                <th>אצווה</th><th>תפוגה</th><th>מינון</th><th>כמות חומר</th><th>כמות מים</th><th>היקף</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.jm.id}>
                  <td>{r.name}</td>
                  <td>{r.material?.activeIngredients.map((a) => `${a.name} ${a.concentration}`).join(', ') || NOT_ENTERED}</td>
                  <td>{r.material?.registrationNumber ?? NOT_ENTERED}</td>
                  <td>{r.jm.execution.batchNumber || NOT_ENTERED}</td>
                  <td>{r.jm.execution.packageExpiry || NOT_ENTERED}</td>
                  <td>{r.jm.execution.chosenDoseText || NOT_ENTERED}</td>
                  <td>{r.jm.execution.materialAmount || NOT_ENTERED}</td>
                  <td>{r.jm.execution.waterAmount || '—'}</td>
                  <td>
                    {r.jm.execution.coverage || NOT_ENTERED}{' '}
                    {r.jm.execution.coverageUnit === 'sqm' ? 'מ״ר'
                      : r.jm.execution.coverageUnit === 'stations' ? 'תיבות' : 'יחידות'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : <p>לא נעשה שימוש בתכשיר.</p>}

        {baitStations.length > 0 && (
          <>
            <h2>תיבות האכלה</h2>
            <div className="table-scroll"><table>
              <thead><tr><th>מזהה</th><th>מיקום</th><th>כמות</th><th>מקובעת</th><th>מועד ביקורת</th></tr></thead>
              <tbody>
                {baitStations.map((b) => (
                  <tr key={b.id}>
                    <td>{b.stationCode}</td>
                    <td>{b.location || '—'}</td>
                    <td>{b.quantity || '—'}</td>
                    <td>{b.secured ? 'כן' : 'לא'}</td>
                    <td>{b.nextCheckDate ? formatDate(b.nextCheckDate) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </>
        )}

        <h2>הנחיות ללקוח</h2>
        {typeof reEntry.hours === 'number' ? (
          <p><strong>זמן כניסה מחדש: {reEntry.hours} שעות</strong> (המחמיר מבין התכשירים שבוצעו).</p>
        ) : reEntry.hours === null ? (
          <p><strong>לא חל זמן כניסה מחדש של ריסוס</strong> – הטיפול בוצע בפיתיון בתיבות האכלה.</p>
        ) : (
          <p><strong>זמן כניסה מחדש: {NOT_ENTERED}</strong> – יש להשלים מהתווית הרשמית.</p>
        )}

        {reEntry.specialInstructions.map((si, i) => (
          <p key={i}><strong>{si.material}:</strong> {si.text}</p>
        ))}

        {rows.map((r) => (
          <div key={r.jm.id}>
            <p><strong>{r.name}</strong>{r.label?.verificationStatus !== 'verified' && ' — מידע התווית טרם אומת'}</p>
            {r.label?.customerInstructions.length ? (
              <ul>{r.label.customerInstructions.map((t, i) => <li key={i}>{t}</li>)}</ul>
            ) : <p>הוראות ללקוח: {NOT_ENTERED}.</p>}
            {r.revealed.length > 0 && <ul>{r.revealed.map((t, i) => <li key={i}>{t}</li>)}</ul>}
            {r.label?.animalWarnings.length ? (
              <>
                <p>אזהרות לבעלי חיים:</p>
                <ul>{r.label.animalWarnings.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </>
            ) : null}
          </div>
        ))}

        {journal.exterminatorNote && <p><strong>הערת המדביר:</strong> {journal.exterminatorNote}</p>}

        {journal.preventionRecommendations.length > 0 && (
          <>
            <h2>המלצות מניעה</h2>
            <ul>{journal.preventionRecommendations.map((r) => <li key={r}>{r}</li>)}</ul>
          </>
        )}

        <h2>אחריות ומעקב</h2>
        <div className="table-scroll"><table>
          <tbody>
            <tr>
              <th style={{ width: '26%' }}>אחריות</th>
              <td>
                {journal.warrantyKind === 'none' && 'ללא אחריות'}
                {journal.warrantyKind === 'days' && `${journal.warrantyValue || NOT_ENTERED} ימים`}
                {journal.warrantyKind === 'months' && `${journal.warrantyValue || NOT_ENTERED} חודשים`}
                {journal.warrantyKind === 'custom' && (journal.warrantyValue || NOT_ENTERED)}
              </td>
              <th style={{ width: '22%' }}>מועד ביקורת הבא</th>
              <td>{journal.nextInspectionDate ? formatDate(journal.nextInspectionDate) : '—'}</td>
            </tr>
          </tbody>
        </table></div>
        {journal.summary && <p><strong>סיכום:</strong> {journal.summary}</p>}

        {attachments.length > 0 && (
          <p className="no-print"><strong>קבצים מצורפים:</strong> {attachments.map((a) => a.name).join(', ')}</p>
        )}

        <h2>חתימות</h2>
        <div className="table-scroll"><table>
          <tbody>
            <tr>
              <td style={{ width: '50%' }}>
                <div>המדביר: {extSig?.signerName || journal.exterminatorName || NOT_ENTERED}</div>
                <div className="sig-box">{extSig ? <img src={extSig.image} alt="חתימת המדביר" /> : <span>לא נחתם</span>}</div>
                <div>{extSig ? formatDateTime(extSig.signedAt) : ''}</div>
              </td>
              <td style={{ width: '50%' }}>
                <div>הלקוח: {custSig?.signerName || customer?.name || NOT_ENTERED}</div>
                <div className="sig-box">{custSig ? <img src={custSig.image} alt="חתימת הלקוח" /> : <span>לא נחתם</span>}</div>
                <div>{custSig ? formatDateTime(custSig.signedAt) : ''}</div>
              </td>
            </tr>
          </tbody>
        </table></div>
        <p>אישור הלקוח לקבלת ההנחיות: {journal.customerAcknowledged ? 'אושר' : 'טרם אושר'}</p>

        <p className="legal">
          מסמך זה מתעד עבודת הדברה לפי הנתונים שהוזנו במערכת על ידי המדביר. אין במסמך זה, ואין במערכת,
          אישור חוקי או קביעה כי העבודה עומדת בדרישות הדין. חובה לפעול לפי הדין החל, תנאי רישיון המדביר
          והתווית הרשמית העדכנית של כל תכשיר. נתונים המסומנים "{NOT_ENTERED}" טרם הוזנו מתווית רשמית מאומתת.
        </p>
      </article>
    </>
  );
}
