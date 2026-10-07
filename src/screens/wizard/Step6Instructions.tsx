import { useMemo } from 'react';
import { useStore } from '../../state/store';
import { Card, Field, Notice, Tag } from '../../components/ui';
import { NOT_ENTERED } from '../../types';
import type { TreatmentTemplate } from '../../types';
import { computeReEntry, hasSprayAction, reEntryHeadline } from '../../lib/reEntry';
import type { StepProps } from './JournalWizard';

/** ההנחיות שנחשפות בגלל תשובה לשדה מותנה בתבנית. */
export function revealedInstructions(
  template: TreatmentTemplate | undefined,
  answers: Record<string, string>,
): string[] {
  if (!template) return [];
  const out: string[] = [];
  for (const field of template.conditionFields) {
    const answer = answers[field.key];
    if (!answer) continue;
    const texts = field.revealInstructions?.[answer];
    if (texts) out.push(...texts);
  }
  return out;
}

export function Step6Instructions({ journalId }: StepProps) {
  const { state, updateJournal, labelFor } = useStore();
  const journal = state.journals.find((j) => j.id === journalId)!;
  const journalMaterials = state.journalMaterials.filter((m) => m.journalId === journalId);

  const rows = useMemo(
    () =>
      journalMaterials.map((jm) => {
        const material = state.materials.find((m) => m.id === jm.materialId);
        const template = state.treatmentTemplates.find((t) => t.id === jm.templateId);
        return {
          jm,
          name: material?.tradeName ?? jm.materialNameSnapshot,
          label: labelFor(jm.materialId),
          revealed: revealedInstructions(template, jm.conditionAnswers),
        };
      }),
    [journalMaterials, state.materials, state.treatmentTemplates, labelFor],
  );

  const sprayPerformed = useMemo(
    () => hasSprayAction(state.journalActions.filter((a) => a.journalId === journalId)),
    [state.journalActions, journalId],
  );

  const reEntry = useMemo(
    () => computeReEntry(rows.map((r) => ({ name: r.name, label: r.label })), { sprayPerformed }),
    [rows, sprayPerformed],
  );

  if (rows.length === 0) {
    return <Card><p className="muted">לא נבחרו חומרים. האזהרות נטענות אוטומטית לפי החומרים שנבחרו בשלב 5.</p></Card>;
  }

  return (
    <>
      <Card>
        <div className="card-title"><h2>זמן כניסה מחדש</h2></div>

        {reEntry.status === 'determinate' && (
          <Notice kind="warn" title={reEntryHeadline(reEntry)}>
            זהו הזמן המחמיר מבין התכשירים שנעשה בהם שימוש, לפי תוויות מאומתות.
          </Notice>
        )}

        {reEntry.status === 'bait_only' && (
          <Notice kind="info" title={reEntryHeadline(reEntry)}>
            יש לפעול לפי הוראות הבטיחות להצבת פיתיון שבתווית.
          </Notice>
        )}

        {reEntry.status === 'no_materials' && (
          <Notice kind="info" title={reEntryHeadline(reEntry)}>
            אם בוצע טיפול בתכשיר, יש להוסיף אותו בשלב 5.
          </Notice>
        )}

        {reEntry.status === 'incomplete' && (
          <Notice kind="error" title={reEntryHeadline(reEntry)}>
            {reEntry.inconsistentBaitClaim ? (
              <div>
                תועדה פעולת ריסוס, אך כל התכשירים שנבחרו מסומנים כטיפול בפיתיון.
                יש לתקן את הפעולות או את התכשירים לפני מסירת הנחיות ללקוח.
              </div>
            ) : (
              <>
                <div>
                  חסר מידע מאומת עבור: <span className="bold">{reEntry.missing.join(', ')}</span>.
                  אין למסור ללקוח זמן כניסה עד להשלמה מהתווית הרשמית.
                </div>
                {reEntry.known.length > 0 && (
                  <div className="mt-2">
                    <span className="bold">מידע חלקי בלבד</span> — אינו הזמן לעבודה כולה:
                    <ul>
                      {reEntry.known.map((k) => (
                        <li key={k.material}>{k.material}: {k.hours} שעות</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </Notice>
        )}

        {reEntry.specialInstructions.map((si, i) => (
          <Notice kind="info" key={i} title={`הוראה מיוחדת · ${si.material}`}>{si.text}</Notice>
        ))}
      </Card>

      <Card>
        <div className="card-title">
          <h2>הנחיות ללקוח</h2>
          <Tag kind="ok">נמסר ללקוח</Tag>
        </div>
        <p className="small muted">
          ההנחיות נטענות מהתווית של כל חומר בנפרד ומוצגות תחת שם החומר הנכון. אין לערוך את נוסח התווית.
        </p>

        {rows.map((row) => (
          <div key={row.jm.id} className="card" style={{ background: 'var(--surface-2)' }}>
            <div className="card-title">
              <h3>{row.name}</h3>
              {(!row.label || row.label.verificationStatus !== 'verified') && <Tag kind="warn">מידע יושלם בהמשך</Tag>}
            </div>

            <div className="section-title">הוראות ללקוח</div>
            {row.label?.customerInstructions.length ? (
              <ul>{row.label.customerInstructions.map((t, i) => <li key={i}>{t}</li>)}</ul>
            ) : (
              <p className="small muted">{NOT_ENTERED} – יש להשלים מהתווית הרשמית.</p>
            )}

            {row.revealed.length > 0 && (
              <>
                <div className="section-title">הוראה בהתאם לבחירה שבוצעה</div>
                <ul>{row.revealed.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </>
            )}

            <div className="section-title">אזהרות לבעלי חיים</div>
            {row.label?.animalWarnings.length ? (
              <ul>{row.label.animalWarnings.map((t, i) => <li key={i}>{t}</li>)}</ul>
            ) : (
              <p className="small muted">{NOT_ENTERED} – יש להשלים מהתווית הרשמית.</p>
            )}
          </div>
        ))}

        <Notice kind="info">
          ציוד המגן של המדביר אינו דרישה מהלקוח ואינו מוצג בהנחיות ללקוח.
        </Notice>
      </Card>

      <Card>
        <div className="card-title">
          <h2>מידע מקצועי למדביר</h2>
          <Tag kind="muted">פנימי</Tag>
        </div>

        {rows.map((row) => (
          <div key={row.jm.id} className="card" style={{ background: 'var(--surface-2)' }}>
            <div className="card-title"><h3>{row.name}</h3></div>

            <div className="section-title">אזהרות לאדם וציוד מגן</div>
            {row.label?.humanWarnings.length ? (
              <ul>{row.label.humanWarnings.map((t, i) => <li key={i}>{t}</li>)}</ul>
            ) : (
              <p className="small muted">{NOT_ENTERED} – יש להשלים מהתווית הרשמית.</p>
            )}

            <div className="section-title">סיכונים לסביבה</div>
            {row.label?.environmentRisks.length ? (
              <ul>{row.label.environmentRisks.map((t, i) => <li key={i}>{t}</li>)}</ul>
            ) : (
              <p className="small muted">{NOT_ENTERED} – יש להשלים מהתווית הרשמית.</p>
            )}

            {row.label?.sourceUrl && (
              <p className="small wrap-anywhere">
                מקור: <a href={row.label.sourceUrl} target="_blank" rel="noreferrer">{row.label.sourceUrl}</a>
              </p>
            )}
          </div>
        ))}
      </Card>

      <Card>
        <Field
          label="הערת מדביר"
          htmlFor="ext-note"
          hint="ההערה מתווספת להנחיות ואינה משנה את נוסח התווית."
        >
          <textarea
            id="ext-note"
            value={journal.exterminatorNote ?? ''}
            onChange={(e) => updateJournal(journalId, { exterminatorNote: e.target.value })}
          />
        </Field>
      </Card>
    </>
  );
}
