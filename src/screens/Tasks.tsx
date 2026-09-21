import { useState } from 'react';
import { useStore } from '../state/store';
import { Card, EmptyState, Field, Tag } from '../components/ui';
import { TASK_KIND_LABEL, formatDate, toDateInput } from '../lib/format';
import type { TaskKind, TaskPriority } from '../types';

export function TasksScreen() {
  const { state, createTask, updateTask } = useStore();
  const [draft, setDraft] = useState({
    kind: 'inspection' as TaskKind,
    title: '',
    customerId: '',
    dueDate: toDateInput(new Date().toISOString()),
    priority: 'normal' as TaskPriority,
    remind: true,
  });

  const open = state.tasks.filter((t) => !t.done).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const done = state.tasks.filter((t) => t.done);

  return (
    <>
      <Card>
        <div className="card-title"><h2>משימה חדשה</h2></div>
        <Field label="סוג משימה" htmlFor="t-kind">
          <select id="t-kind" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as TaskKind })}>
            {(Object.keys(TASK_KIND_LABEL) as TaskKind[]).map((k) => (
              <option key={k} value={k}>{TASK_KIND_LABEL[k]}</option>
            ))}
          </select>
        </Field>
        <Field label="כותרת" htmlFor="t-title">
          <input id="t-title" type="text" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </Field>
        <div className="row">
          <Field label="לקוח" htmlFor="t-customer">
            <select id="t-customer" value={draft.customerId} onChange={(e) => setDraft({ ...draft, customerId: e.target.value })}>
              <option value="">ללא שיוך</option>
              {state.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="תאריך יעד" htmlFor="t-due">
            <input id="t-due" type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} />
          </Field>
        </div>
        <Field label="עדיפות" htmlFor="t-priority">
          <select id="t-priority" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as TaskPriority })}>
            <option value="low">נמוכה</option>
            <option value="normal">רגילה</option>
            <option value="high">גבוהה</option>
          </select>
        </Field>
        <label className="check-line">
          <input type="checkbox" checked={draft.remind} onChange={(e) => setDraft({ ...draft, remind: e.target.checked })} />
          התראה בתאריך היעד
        </label>
        <div className="mt-3">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!draft.title.trim()}
            onClick={() => {
              createTask({
                kind: draft.kind,
                title: draft.title,
                customerId: draft.customerId || undefined,
                dueDate: draft.dueDate,
                priority: draft.priority,
                done: false,
                remind: draft.remind,
              });
              setDraft({ ...draft, title: '', customerId: '' });
            }}
          >
            הוסף משימה
          </button>
        </div>
      </Card>

      <Card>
        <div className="card-title"><h3>משימות פתוחות</h3></div>
        {open.length === 0 ? (
          <EmptyState icon="✓" title="אין משימות פתוחות." />
        ) : (
          <div className="list">
            {open.map((t) => {
              const customer = state.customers.find((c) => c.id === t.customerId);
              const overdue = t.dueDate < toDateInput(new Date().toISOString());
              return (
                <div key={t.id} className="list-row" style={{ cursor: 'default' }}>
                  <span className="grow">
                    <span className="ttl">{t.title}</span>
                    <span className="sub">
                      {TASK_KIND_LABEL[t.kind]} · {formatDate(t.dueDate)}
                      {customer ? ` · ${customer.name}` : ''}
                    </span>
                  </span>
                  {t.priority === 'high' && <Tag kind="error">דחוף</Tag>}
                  {overdue && <Tag kind="warn">באיחור</Tag>}
                  <button type="button" className="btn btn-soft btn-sm" onClick={() => updateTask(t.id, { done: true })}>
                    בוצע
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {done.length > 0 && (
        <Card>
          <div className="card-title"><h3>בוצעו ({done.length})</h3></div>
          <div className="list">
            {done.slice(-10).reverse().map((t) => (
              <div key={t.id} className="list-row" style={{ cursor: 'default', opacity: 0.7 }}>
                <span className="grow">
                  <span className="ttl">{t.title}</span>
                  <span className="sub">{formatDate(t.dueDate)}</span>
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => updateTask(t.id, { done: false })}>
                  החזר לפתוחות
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
