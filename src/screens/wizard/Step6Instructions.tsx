import { useMemo } from 'react';
import { useStore } from '../../state/store';
import { Card, Field, Notice, Tag } from '../../components/ui';
import { NOT_ENTERED } from '../../types';
import type { MaterialLabel, TreatmentTemplate } from '../../types';
import type { StepProps } from './JournalWizard';

export interface ReEntryResult {
  /** השעה המחמירה ביותר מבין החומרים. undefined = לא הוזן, null = אין זמן כניסה (פיתיון בלבד) */
  hours: number | undefined | null;
  /** הוראות מיוחדות נוספות, לצד זמן הכניסה */
  specialInstructions: { material: string; text: string }[];
  /** חומרים שזמן הכניסה שלהם לא הוזן */
  missing: string[];
}

/**
 * זמן הכניסה מחדש הוא המחמיר ביותר מבין החומרים.
 * חומר שהוא פיתיון (null) אינו תורם זמן כניסה של ריסוס, אך הוראותיו מוצגות בנפרד.
 */
export function computeReEntry(
  materials: { name: string; label?: MaterialLabel }[],
): ReEntryResult {
  let hours: number | undefined | null = undefined;
  const specialInstructions: { material: string; text: string }[] = [];
  const missing: string[] = [];
  let sawBait = false;

  for (const { name, label } of materials) {
    if (!label) { missing.push(name); continue; }
    if (label.reEntryHours === null) {
      sawBait = true;
      if (label.reEntryNote) specialInstructions.push({ material: name, text: label.reEntryNote });
      continue;
    }
    if (typeof label.reEntryHours === 'number') {
      hours = typeof hours === 'number' ? Math.max(hours, label.reEntryHours) : label.reEntryHours;
    } else {
      missing.push(name);
      if (label.reEntryNote) specialInstructions.push({ material: name, text: label.reEntryNote });
    }
  }

  if (hours === undefined && sawBait && missing.length === 0) hours = null;
  return { hours, specialInstructions, missing };
}

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

  const reEntry = useMemo(
    () => computeReEntry(rows.map((r) => ({ name: r.name, label: r.label }))),
    [rows],
  );

  if (rows.length === 0) {
    return <Card><p className="muted">לא נבחרו חומרים. האזהרות נטענות אוטומטית לפי החומרים שנבחרו בשלב 5.</p></Card>;
  }

  return (
    <>
      <Card>
        <div className="card-title"><h2>זמן כניסה מחדש</h2></div>
        {typeof reEntry.hours === 'number' ? (
          <Notice kind="warn" title={`אין להיכנס לשטח המטופל במשך ${reEntry.hours} שעות`}>
            זהו הזמן המחמיר ביותר מבין החומרים שנבחרו ביומן זה.
          </Notice>
        ) : reEntry.hours === null ? (
          <Notice kind="info" title="לא חל זמן כניסה מחדש של ריסוס">
            הטיפול בוצע בפיתיון בתיבות האכלה בלבד.
          </Notice>
        ) : (
          <Notice kind="warn" title="זמן כניסה מחדש לא הוזן">
            יש להשלים את זמן הכניסה מהתווית הרשמית של כל חומר לפני מסירת ההנחיות ללקוח.
            {reEntry.missing.length > 0 && <div className="mt-2 small">חסר עבור: {reEntry.missing.join(', ')}</div>}
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
