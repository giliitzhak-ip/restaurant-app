import { useStore } from '../../state/store';
import { Card, ChipGroup, Field } from '../../components/ui';
import { AREAS, EQUIPMENT, PRE_TREATMENT_ACTIONS } from '../../data/pests';
import { ACTION_LABEL } from '../../lib/format';
import type { ActionKind } from '../../types';
import type { StepProps } from './JournalWizard';

export function Step4Treatment({ journalId }: StepProps) {
  const { state, updateJournal, toggleJournalAction, updateJournalAction } = useStore();
  const journal = state.journals.find((j) => j.id === journalId)!;
  const actions = state.journalActions.filter((a) => a.journalId === journalId);

  return (
    <>
      <Card>
        <div className="card-title"><h2>החלטה על טיפול</h2></div>

        <ChipGroup
          label="פעולות שבוצעו לפני שימוש בתכשיר"
          multiple
          options={PRE_TREATMENT_ACTIONS.map((a) => ({ value: a, label: a }))}
          value={journal.preTreatmentActions}
          onChange={(v) => updateJournal(journalId, { preTreatmentActions: v })}
        />

        <ChipGroup<ActionKind>
          label="פעולות הטיפול שבוצעו"
          multiple
          hint="שדות נוספים ייפתחו רק עבור הפעולות שנבחרו."
          options={(Object.keys(ACTION_LABEL) as ActionKind[]).map((k) => ({ value: k, label: ACTION_LABEL[k] }))}
          value={actions.map((a) => a.kind)}
          onChange={(next) => {
            const current = actions.map((a) => a.kind);
            const added = next.filter((k) => !current.includes(k));
            const removed = current.filter((k) => !next.includes(k));
            for (const k of [...added, ...removed]) toggleJournalAction(journalId, k);
          }}
        />
      </Card>

      {actions.map((action) => (
        <Card key={action.id}>
          <div className="card-title"><h3>{ACTION_LABEL[action.kind]}</h3></div>

          <ChipGroup
            label="אזורי הטיפול"
            multiple
            options={AREAS.map((a) => ({ value: a, label: a }))}
            value={action.areas}
            onChange={(v) => updateJournalAction(action.id, { areas: v })}
          />

          <ChipGroup
            label="ציוד שבו נעשה שימוש"
            multiple
            options={EQUIPMENT.map((e) => ({ value: e, label: e }))}
            value={action.equipment}
            onChange={(v) => updateJournalAction(action.id, { equipment: v })}
          />

          <Field label="הערה לפעולה" htmlFor={`note-${action.id}`}>
            <input
              id={`note-${action.id}`}
              type="text"
              value={action.notes ?? ''}
              onChange={(e) => updateJournalAction(action.id, { notes: e.target.value })}
            />
          </Field>
        </Card>
      ))}

      {actions.length === 0 && (
        <Card><p className="muted">בחר פעולה אחת לפחות כדי לפתוח את שדות האזורים והציוד.</p></Card>
      )}
    </>
  );
}
