import { useMemo, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { Card, Field, Notice, Tag } from '../../components/ui';
import { SearchCombobox, type ComboItem } from '../../components/SearchCombobox';
import { BaitStations } from '../../components/BaitStations';
import { pestName } from '../../data/pests';
import { NOT_ENTERED, type JournalMaterial, type Material, type MaterialDose } from '../../types';
import { formatDate } from '../../lib/format';
import type { StepProps } from './JournalWizard';

/** האם תוקף הרישום שעל התווית חלף. */
export function isRegistrationStale(validUntil?: string): boolean {
  if (!validUntil) return false;
  const d = new Date(validUntil);
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
}

/** מסנן מינונים לפי התבנית ולפי התשובות לשדות המותנים. */
export function visibleDoses(
  doses: MaterialDose[],
  doseIds: string[] | undefined,
  answers: Record<string, string>,
): MaterialDose[] {
  const pool = doseIds && doseIds.length ? doses.filter((d) => doseIds.includes(d.id)) : doses;
  return pool.filter((d) => {
    if (!d.condition) return true;
    return answers[d.condition.field] === d.condition.value;
  });
}

export function Step5Materials({ journalId }: StepProps) {
  const {
    state, selectMaterial, updateJournalMaterial, removeJournalMaterial, replaceJournalMaterial, labelFor,
  } = useStore();
  const journal = state.journals.find((j) => j.id === journalId);
  const journalMaterials = state.journalMaterials.filter((m) => m.journalId === journalId);
  const [replacingId, setReplacingId] = useState<string | null>(null);

  /** תיבות האכלה נדרשות כשהתבנית שנבחרה היא טיפול בפיתיון, או כשנבחרה פעולת תיבות. */
  const needsBaitStations = useMemo(() => {
    const byTemplate = journalMaterials.some((jm) =>
      state.treatmentTemplates.some((t) => t.id === jm.templateId && t.requiresBaitStations),
    );
    const byAction = state.journalActions.some(
      (a) => a.journalId === journalId && a.kind === 'bait_stations',
    );
    return byTemplate || byAction;
  }, [journalMaterials, state.treatmentTemplates, state.journalActions, journalId]);
  const batchRef = useRef<HTMLInputElement>(null);

  const items = useMemo<ComboItem[]>(
    () =>
      state.materials
        .filter((m) => !m.archived)
        .map((m) => {
          const label = state.materialLabels.find((l) => l.materialId === m.id);
          const unverified = !label || label.verificationStatus !== 'verified';
          return {
            id: m.id,
            title: m.tradeName,
            subtitle: [
              m.activeIngredients.map((a) => `${a.name} ${a.concentration}`).join(', ') || NOT_ENTERED,
              m.registrationNumber !== NOT_ENTERED ? `מס' רישום ${m.registrationNumber}` : 'מס\' רישום לא הוזן',
            ].join(' · '),
            badge: unverified ? <span className="tag tag-warn" style={{ marginInlineStart: 8 }}>מידע יושלם בהמשך</span> : undefined,
            searchable: {
              primary: m.tradeName,
              secondary: [
                ...m.aliases,
                ...m.activeIngredients.map((a) => a.name),
                m.registrationNumber,
              ],
            },
          };
        }),
    [state.materials, state.materialLabels],
  );

  function onPick(materialId: string): void {
    const material = state.materials.find((m) => m.id === materialId);
    if (!material) return;
    if (replacingId) {
      replaceJournalMaterial(replacingId, material);
      setReplacingId(null);
      return;
    }
    selectMaterial(journalId, material);
  }

  return (
    <>
      <Card>
        <div className="card-title"><h2>תכשירים וחומרים</h2></div>

        <SearchCombobox
          label={replacingId ? 'בחר חומר מחליף' : 'חיפוש חומר'}
          placeholder="הקלד שם חומר…"
          items={items}
          onSelect={onPick}
          nextFieldRef={batchRef}
          hint="המאגר נפתח רק אחרי הקלדה. אפשר לחפש לפי שם מסחרי, חומר פעיל או מספר רישום."
        />

        {replacingId && (
          <Notice kind="warn" title="מצב החלפת חומר">
            בחירת חומר חדש תנקה את המינון ונתוני הביצוע של החומר המוחלף בלבד. שאר החומרים ביומן לא ישתנו.
            <div className="mt-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReplacingId(null)}>ביטול החלפה</button>
            </div>
          </Notice>
        )}

        {journalMaterials.length === 0 && (
          <p className="muted">לא נבחר חומר. אפשר לבחור כמה חומרים לאותו יומן – לכל חומר ייפתח כרטיס נפרד.</p>
        )}
      </Card>

      {journalMaterials.map((jm) => (
        <MaterialCard
          key={jm.id}
          jm={jm}
          material={state.materials.find((m) => m.id === jm.materialId)}
          onReplace={() => setReplacingId(jm.id)}
          onRemove={() => removeJournalMaterial(jm.id)}
          onUpdate={(patch) => updateJournalMaterial(jm.id, patch)}
          labelFor={labelFor}
          templates={state.treatmentTemplates.filter((t) => t.materialId === jm.materialId && !t.archived)}
          batchRef={batchRef}
        />
      ))}

      {needsBaitStations && (
        <BaitStations journalId={journalId} customerId={journal?.customerId} />
      )}
    </>
  );
}

function MaterialCard({
  jm, material, onReplace, onRemove, onUpdate, labelFor, templates, batchRef,
}: {
  jm: JournalMaterial;
  material?: Material;
  onReplace: () => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<JournalMaterial>) => void;
  labelFor: (id: string) => ReturnType<typeof Object> | undefined;
  templates: { id: string; name: string; doseIds: string[]; conditionFields: { key: string; question: string; options: { value: string; label: string }[]; required: boolean }[]; requiresBaitStations?: boolean }[];
  batchRef: React.RefObject<HTMLInputElement | null>;
}) {
  const label = labelFor(jm.materialId) as import('../../types').MaterialLabel | undefined;
  if (!material) return null;

  const unverified = !label || label.verificationStatus !== 'verified';
  const stale = isRegistrationStale(label?.registrationValidUntil);
  const template = templates.find((t) => t.id === jm.templateId);
  const doses = visibleDoses(label?.doses ?? [], template?.doseIds, jm.conditionAnswers);
  const missingConditions = (template?.conditionFields ?? []).filter(
    (f) => f.required && !jm.conditionAnswers[f.key],
  );
  const exec = jm.execution;

  return (
    <Card>
      <div className="card-title">
        <h3>{material.tradeName}</h3>
        {unverified && <Tag kind="warn">מידע יושלם בהמשך</Tag>}
      </div>

      <dl className="small" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', margin: 0 }}>
        <dt className="muted">מזהה פנימי</dt><dd style={{ margin: 0 }}>{material.id}</dd>
        <dt className="muted">תוארית</dt><dd style={{ margin: 0 }}>{material.formulation}</dd>
        <dt className="muted">חומר פעיל וריכוז</dt>
        <dd style={{ margin: 0 }}>
          {material.activeIngredients.length
            ? material.activeIngredients.map((a) => `${a.name} ${a.concentration}`).join(' · ')
            : NOT_ENTERED}
        </dd>
        <dt className="muted">מספר רישום</dt><dd style={{ margin: 0 }}>{material.registrationNumber}</dd>
        <dt className="muted">תוקף רישום</dt>
        <dd style={{ margin: 0 }}>{label?.registrationValidUntil ? formatDate(label.registrationValidUntil) : NOT_ENTERED}</dd>
        <dt className="muted">מזיקים מורשים</dt>
        <dd style={{ margin: 0 }}>
          {label?.approvedPestIds.length ? label.approvedPestIds.map(pestName).join(', ') : NOT_ENTERED}
        </dd>
        <dt className="muted">זמן כניסה מחדש</dt>
        <dd style={{ margin: 0 }}>
          {label?.reEntryHours === null
            ? 'לא חל (טיפול בפיתיון)'
            : typeof label?.reEntryHours === 'number' ? `${label.reEntryHours} שעות` : NOT_ENTERED}
        </dd>
        <dt className="muted">סטטוס אימות</dt>
        <dd style={{ margin: 0 }}>
          {label?.verificationStatus === 'verified'
            ? `מאומת · ${formatDate(label.verifiedAt)}`
            : 'טרם אומת מול תווית רשמית'}
        </dd>
        <dt className="muted">תווית</dt>
        <dd style={{ margin: 0 }} className="wrap-anywhere">
          {label?.sourceUrl
            ? <a href={label.sourceUrl} target="_blank" rel="noreferrer">קישור לתווית הרשמית</a>
            : NOT_ENTERED}
        </dd>
      </dl>

      {unverified && (
        <Notice kind="warn" title="מידע התווית טרם אומת">
          ניתן לבחור את החומר ולשמור טיוטה, אך המינונים והאזהרות אינם מוצגים כמאומתים.
          יש להשלים את הנתונים מהתווית הרשמית העדכנית ולאשר ידנית לפני הסתמכות מקצועית.
          <label className="check-line">
            <input
              type="checkbox"
              checked={Boolean(jm.acknowledgedUnverified)}
              onChange={(e) =>
                onUpdate({
                  acknowledgedUnverified: e.target.checked,
                  acknowledgedAt: e.target.checked ? new Date().toISOString() : undefined,
                })
              }
            />
            קראתי והבנתי
          </label>
        </Notice>
      )}

      {stale && (
        <Notice kind="error" title="תוקף הרישום שעל התווית חלף">
          תאריך התוקף שהוזן הוא {formatDate(label?.registrationValidUntil)}. יש לבדוק תווית עדכנית לפני שימוש.
        </Notice>
      )}

      <Field label="תבנית טיפול" htmlFor={`tpl-${jm.id}`} hint="התבנית קובעת אילו שדות ומינונים רלוונטיים.">
        <select
          id={`tpl-${jm.id}`}
          value={jm.templateId ?? ''}
          onChange={(e) => onUpdate({ templateId: e.target.value || undefined, conditionAnswers: {} })}
        >
          <option value="">ללא תבנית</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </Field>

      {(template?.conditionFields ?? []).map((field) => (
        <div className="field" role="group" aria-labelledby={`cond-${jm.id}-${field.key}`} key={field.key}>
          <span className="field-label" id={`cond-${jm.id}-${field.key}`}>
            {field.question}{field.required && ' *'}
          </span>
          <div className="chips">
            {field.options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="chip"
                aria-pressed={jm.conditionAnswers[field.key] === opt.value}
                onClick={() =>
                  onUpdate({
                    conditionAnswers: { ...jm.conditionAnswers, [field.key]: opt.value },
                    // החלפת תנאי מאפסת את בחירת המינון של החומר הזה בלבד
                    execution: { ...jm.execution, chosenDoseId: undefined, chosenDoseText: '' },
                  })
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {missingConditions.length > 0 ? (
        <Notice kind="warn">
          יש לבחור {missingConditions.map((f) => f.question).join(', ')} כדי להציג את טווח המינון המתאים.
        </Notice>
      ) : (
        <div className="field">
          <span className="field-label">מינונים מהתווית</span>
          {doses.length === 0 ? (
            <p className="muted small">אין מינון מתאים במאגר. יש להזין מהתווית הרשמית.</p>
          ) : (
            <div className="stack">
              {doses.map((dose) => (
                <button
                  key={dose.id}
                  type="button"
                  className={`list-row ${exec.chosenDoseId === dose.id ? 'selected' : ''}`}
                  style={exec.chosenDoseId === dose.id ? { borderColor: 'var(--green-action)', background: 'var(--green-light)' } : undefined}
                  onClick={() => onUpdate({ execution: { ...exec, chosenDoseId: dose.id, chosenDoseText: dose.amount } })}
                >
                  <span className="grow">
                    <span className="ttl">{dose.label}</span>
                    <span className="sub">
                      מינון: {dose.amount}{dose.unit ? ` ${dose.unit}` : ''}
                      {dose.notes ? ` · ${dose.notes}` : ''}
                    </span>
                  </span>
                  {dose.amount === NOT_ENTERED && <Tag kind="warn">לא הוזן</Tag>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <h4 className="section-title">נתוני ביצוע (חובה בכל יומן)</h4>
      <div className="row">
        <Field label="מספר אצווה" htmlFor={`batch-${jm.id}`}>
          <input
            id={`batch-${jm.id}`}
            ref={batchRef}
            type="text"
            value={exec.batchNumber}
            aria-invalid={!exec.batchNumber}
            onChange={(e) => onUpdate({ execution: { ...exec, batchNumber: e.target.value } })}
          />
        </Field>
        <Field label="תאריך תפוגה שעל האריזה" htmlFor={`exp-${jm.id}`}>
          <input
            id={`exp-${jm.id}`}
            type="date"
            value={exec.packageExpiry}
            aria-invalid={!exec.packageExpiry}
            onChange={(e) => onUpdate({ execution: { ...exec, packageExpiry: e.target.value } })}
          />
        </Field>
      </div>

      <Field
        label="המינון שנבחר בפועל"
        htmlFor={`dose-${jm.id}`}
        hint="יש להזין את המינון לפי התווית הרשמית העדכנית."
      >
        <input
          id={`dose-${jm.id}`}
          type="text"
          value={exec.chosenDoseText}
          onChange={(e) => onUpdate({ execution: { ...exec, chosenDoseText: e.target.value } })}
        />
      </Field>

      <div className="row">
        <Field label="כמות חומר בפועל" htmlFor={`amt-${jm.id}`}>
          <input
            id={`amt-${jm.id}`}
            type="text"
            inputMode="decimal"
            value={exec.materialAmount}
            onChange={(e) => onUpdate({ execution: { ...exec, materialAmount: e.target.value } })}
          />
        </Field>
        <Field label="כמות מים בפועל" htmlFor={`wtr-${jm.id}`}>
          <input
            id={`wtr-${jm.id}`}
            type="text"
            inputMode="decimal"
            value={exec.waterAmount}
            onChange={(e) => onUpdate({ execution: { ...exec, waterAmount: e.target.value } })}
          />
        </Field>
      </div>

      <div className="row">
        <Field label="היקף הטיפול" htmlFor={`cov-${jm.id}`}>
          <input
            id={`cov-${jm.id}`}
            type="text"
            inputMode="decimal"
            value={exec.coverage}
            onChange={(e) => onUpdate({ execution: { ...exec, coverage: e.target.value } })}
          />
        </Field>
        <Field label="יחידת מדידה" htmlFor={`cvu-${jm.id}`}>
          <select
            id={`cvu-${jm.id}`}
            value={exec.coverageUnit}
            onChange={(e) => onUpdate({ execution: { ...exec, coverageUnit: e.target.value as 'sqm' | 'stations' | 'units' } })}
          >
            <option value="sqm">מ״ר</option>
            <option value="stations">תיבות האכלה</option>
            <option value="units">יחידות</option>
          </select>
        </Field>
      </div>

      <div className="row mt-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onReplace}>החלף חומר</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRemove}>הסר מהיומן</button>
      </div>
    </Card>
  );
}
