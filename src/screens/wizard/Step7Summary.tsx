import { useState } from 'react';
import { useStore } from '../../state/store';
import { Card, ChipGroup, Field, Notice } from '../../components/ui';
import { PREVENTION_RECOMMENDATIONS } from '../../data/pests';
import { addDays, addMonths, toDateInput } from '../../lib/format';
import type { WarrantyKind } from '../../types';
import type { StepProps } from './JournalWizard';

const WARRANTY_LABEL: Record<WarrantyKind, string> = {
  none: 'ללא אחריות',
  days: 'מספר ימים',
  months: 'מספר חודשים',
  custom: 'טקסט מותאם',
};

export function Step7Summary({ journalId }: StepProps) {
  const { state, updateJournal, createTask } = useStore();
  const journal = state.journals.find((j) => j.id === journalId)!;
  const [taskCreated, setTaskCreated] = useState(false);

  const linkedTask = state.tasks.find((t) => t.journalId === journalId && t.kind === 'inspection');

  function suggestNextInspection(kind: WarrantyKind, value?: string): string | undefined {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    if (kind === 'days') return toDateInput(addDays(journal.startedAt, n));
    if (kind === 'months') return toDateInput(addMonths(journal.startedAt, n));
    return undefined;
  }

  return (
    <>
      <Card>
        <div className="card-title"><h2>סיכום, אחריות וביקורת</h2></div>

        <ChipGroup
          label="פעולות מניעה מומלצות"
          multiple
          options={PREVENTION_RECOMMENDATIONS.map((r) => ({ value: r, label: r }))}
          value={journal.preventionRecommendations}
          onChange={(v) => updateJournal(journalId, { preventionRecommendations: v })}
        />
      </Card>

      <Card>
        <div className="card-title"><h3>אחריות</h3></div>

        <ChipGroup<WarrantyKind>
          label="סוג אחריות"
          options={(Object.keys(WARRANTY_LABEL) as WarrantyKind[]).map((k) => ({ value: k, label: WARRANTY_LABEL[k] }))}
          value={journal.warrantyKind}
          onChange={(v) => updateJournal(journalId, { warrantyKind: v[0], warrantyValue: '' })}
        />

        {journal.warrantyKind === 'days' && (
          <Field label="מספר ימי אחריות" htmlFor="warranty-days">
            <input
              id="warranty-days"
              type="number"
              min={1}
              value={journal.warrantyValue ?? ''}
              onChange={(e) => {
                const next = suggestNextInspection('days', e.target.value);
                updateJournal(journalId, {
                  warrantyValue: e.target.value,
                  nextInspectionDate: journal.nextInspectionDate || next,
                });
              }}
            />
          </Field>
        )}

        {journal.warrantyKind === 'months' && (
          <Field label="מספר חודשי אחריות" htmlFor="warranty-months">
            <input
              id="warranty-months"
              type="number"
              min={1}
              value={journal.warrantyValue ?? ''}
              onChange={(e) => {
                const next = suggestNextInspection('months', e.target.value);
                updateJournal(journalId, {
                  warrantyValue: e.target.value,
                  nextInspectionDate: journal.nextInspectionDate || next,
                });
              }}
            />
          </Field>
        )}

        {journal.warrantyKind === 'custom' && (
          <Field label="נוסח האחריות" htmlFor="warranty-custom">
            <textarea
              id="warranty-custom"
              value={journal.warrantyValue ?? ''}
              onChange={(e) => updateJournal(journalId, { warrantyValue: e.target.value })}
            />
          </Field>
        )}
      </Card>

      <Card>
        <div className="card-title"><h3>ביקורת ומעקב</h3></div>

        <Field label="מועד ביקורת הבא" htmlFor="next-inspection">
          <input
            id="next-inspection"
            type="date"
            value={journal.nextInspectionDate ?? ''}
            onChange={(e) => updateJournal(journalId, { nextInspectionDate: e.target.value })}
          />
        </Field>

        {linkedTask || taskCreated ? (
          <Notice kind="info">נוצרה משימת מעקב שתופיע במסך המשימות ובלוח השנה.</Notice>
        ) : (
          <button
            type="button"
            className="btn btn-soft"
            disabled={!journal.nextInspectionDate}
            onClick={() => {
              if (!journal.nextInspectionDate) return;
              const customer = state.customers.find((c) => c.id === journal.customerId);
              createTask({
                kind: 'inspection',
                title: `ביקורת לאחר טיפול · ${customer?.name ?? 'לקוח'}`,
                customerId: journal.customerId,
                journalId,
                dueDate: journal.nextInspectionDate,
                priority: 'normal',
                done: false,
                remind: true,
              });
              setTaskCreated(true);
            }}
          >
            צור משימת מעקב אוטומטית
          </button>
        )}
      </Card>

      <Card>
        <Field label="סיכום מקצועי קצר" htmlFor="summary">
          <textarea
            id="summary"
            value={journal.summary ?? ''}
            onChange={(e) => updateJournal(journalId, { summary: e.target.value })}
          />
        </Field>
      </Card>
    </>
  );
}
