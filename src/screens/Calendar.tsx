import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { Card, EmptyState, Tag } from '../components/ui';
import { navigate } from '../router';
import { TASK_KIND_LABEL, formatDate, journalNumberText, pad, toDateInput } from '../lib/format';

const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

export function CalendarScreen() {
  const { state } = useStore();
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => toDateInput(new Date().toISOString()));

  const { cells, monthLabel } = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const lead = first.getDay();
    const list: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= daysInMonth; d++) list.push(`${year}-${pad(month + 1)}-${pad(d)}`);
    return {
      cells: list,
      monthLabel: first.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }),
    };
  }, [cursor]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of state.tasks) {
      if (t.done) continue;
      map.set(t.dueDate, (map.get(t.dueDate) ?? 0) + 1);
    }
    return map;
  }, [state.tasks]);

  const journalsByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const j of state.journals) {
      const d = j.startedAt.slice(0, 10);
      map.set(d, (map.get(d) ?? 0) + 1);
    }
    return map;
  }, [state.journals]);

  const dayTasks = state.tasks.filter((t) => t.dueDate === selected && !t.done);
  const dayJournals = state.journals.filter((j) => j.startedAt.slice(0, 10) === selected);
  const dayStops = state.routes
    .filter((r) => r.date === selected)
    .flatMap((r) => state.routeStops.filter((s) => s.routeId === r.id));

  return (
    <>
      <Card>
        <div className="spread mb-3">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          >
            ‹ חודש קודם
          </button>
          <h2>{monthLabel}</h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          >
            חודש הבא ›
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {WEEKDAYS.map((d) => (
            <div key={d} className="small muted" style={{ textAlign: 'center', fontWeight: 700 }}>{d}</div>
          ))}
          {cells.map((date, i) => {
            if (!date) return <div key={`e${i}`} />;
            const count = (tasksByDate.get(date) ?? 0) + (journalsByDate.get(date) ?? 0);
            const isSelected = date === selected;
            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelected(date)}
                aria-pressed={isSelected}
                aria-label={`${formatDate(date)}${count ? `, ${count} פריטים` : ''}`}
                style={{
                  minHeight: 46,
                  borderRadius: 10,
                  border: `1px solid ${isSelected ? 'var(--green-action)' : 'var(--border)'}`,
                  background: isSelected ? 'var(--green-light)' : 'var(--surface)',
                  color: 'var(--text)',
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <span>{Number(date.slice(8))}</span>
                {count > 0 && (
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--green-action)' }} />
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <div className="card-title"><h3>{formatDate(selected)}</h3></div>

        {dayStops.length > 0 && (
          <>
            <div className="section-title">תחנות מסלול</div>
            <p className="small">{dayStops.length} תחנות מתוכננות.</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('#/route')}>פתח מסלול</button>
          </>
        )}

        <div className="section-title">משימות</div>
        {dayTasks.length ? (
          <div className="list">
            {dayTasks.map((t) => (
              <div key={t.id} className="list-row" style={{ cursor: 'default' }}>
                <span className="grow">
                  <span className="ttl">{t.title}</span>
                  <span className="sub">{TASK_KIND_LABEL[t.kind]}</span>
                </span>
                {t.priority === 'high' && <Tag kind="error">דחוף</Tag>}
              </div>
            ))}
          </div>
        ) : <p className="muted small">אין משימות ליום זה.</p>}

        <div className="section-title">יומנים</div>
        {dayJournals.length ? (
          <div className="list">
            {dayJournals.map((j) => (
              <button key={j.id} type="button" className="list-row" onClick={() => navigate(`#/journal/${j.id}/${j.lastStep || 1}`)}>
                <span className="grow">
                  <span className="ttl">{journalNumberText(j.journalNumber)}</span>
                  <span className="sub">{state.customers.find((c) => c.id === j.customerId)?.name ?? 'ללא לקוח'}</span>
                </span>
              </button>
            ))}
          </div>
        ) : <EmptyState icon="▦" title="אין יומנים ליום זה." />}
      </Card>
    </>
  );
}
