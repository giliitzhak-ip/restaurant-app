import { useStore } from '../../state/store';
import { Card, ChipGroup, Field } from '../../components/ui';
import { fromDateTimeInputs, toDateInput, toTimeInput, journalNumberText, WORK_KIND_LABEL, VISIT_KIND_LABEL } from '../../lib/format';
import type { StepProps } from './JournalWizard';
import type { VisitKind, WorkKind } from '../../types';

export function Step1Work({ journalId }: StepProps) {
  const { state, updateJournal } = useStore();
  const journal = state.journals.find((j) => j.id === journalId)!;
  const exterminator = state.exterminators.find((e) => e.id === journal.exterminatorId);

  const date = toDateInput(journal.startedAt);
  const time = toTimeInput(journal.startedAt);

  return (
    <Card>
      <div className="card-title">
        <h2>פרטי העבודה</h2>
        <span className="tag tag-ok">{journalNumberText(journal.journalNumber)}</span>
      </div>

      <div className="row">
        <Field label="תאריך התחלה" htmlFor="start-date">
          <input
            id="start-date"
            type="date"
            value={date}
            onChange={(e) => updateJournal(journal.id, { startedAt: fromDateTimeInputs(e.target.value, time) })}
          />
        </Field>
        <Field label="שעת התחלה" htmlFor="start-time">
          <input
            id="start-time"
            type="time"
            value={time}
            onChange={(e) => updateJournal(journal.id, { startedAt: fromDateTimeInputs(date, e.target.value) })}
          />
        </Field>
      </div>

      <ChipGroup<WorkKind>
        label="סוג עבודה"
        options={(Object.keys(WORK_KIND_LABEL) as WorkKind[]).map((k) => ({ value: k, label: WORK_KIND_LABEL[k] }))}
        value={journal.workKind}
        onChange={(v) => updateJournal(journal.id, { workKind: v[0] })}
      />

      <ChipGroup<VisitKind>
        label="סוג ביקור"
        options={(Object.keys(VISIT_KIND_LABEL) as VisitKind[]).map((k) => ({ value: k, label: VISIT_KIND_LABEL[k] }))}
        value={journal.visitKind}
        onChange={(v) => updateJournal(journal.id, { visitKind: v[0] })}
      />

      <div className="row">
        <Field label="שם המדביר" htmlFor="ext-name">
          <input
            id="ext-name"
            type="text"
            value={journal.exterminatorName}
            onChange={(e) => updateJournal(journal.id, { exterminatorName: e.target.value })}
          />
        </Field>
        <Field
          label="מספר רישיון הדברה"
          htmlFor="ext-license"
          hint={exterminator?.licenseNumber ? undefined : 'אפשר לשמור את מספר הרישיון הקבוע במסך פרופיל.'}
        >
          <input
            id="ext-license"
            type="text"
            inputMode="numeric"
            value={journal.licenseNumber}
            onChange={(e) => updateJournal(journal.id, { licenseNumber: e.target.value })}
          />
        </Field>
      </div>

      <Field label="עובד נוסף (לא חובה)" htmlFor="assistant" hint="שם עובד שסייע בביצוע העבודה.">
        <input
          id="assistant"
          type="text"
          value={journal.assistantName ?? ''}
          onChange={(e) => updateJournal(journal.id, { assistantName: e.target.value })}
        />
      </Field>
    </Card>
  );
}
