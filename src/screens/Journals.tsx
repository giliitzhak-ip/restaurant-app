import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { Card, EmptyState, Field, Tag } from '../components/ui';
import { navigate } from '../router';
import { JOURNAL_STATUS_LABEL, formatDateTime, journalNumberText } from '../lib/format';
import { normalize } from '../lib/search';
import { pestName } from '../data/pests';
import type { JournalStatus } from '../types';

const FILTERS: { value: JournalStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'הכול' },
  { value: 'draft', label: 'טיוטה' },
  { value: 'completed', label: 'הושלם' },
  { value: 'sent', label: 'נשלח' },
  { value: 'needs_completion', label: 'דורש השלמה' },
];

export function JournalsScreen() {
  const { state, duplicateJournal } = useStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<JournalStatus | 'all'>('all');

  const results = useMemo(() => {
    const q = normalize(query);
    return state.journals
      .filter((j) => (filter === 'all' ? true : j.status === filter))
      .filter((j) => {
        if (!q) return true;
        const customer = state.customers.find((c) => c.id === j.customerId);
        const materials = state.journalMaterials
          .filter((m) => m.journalId === j.id)
          .map((m) => m.materialNameSnapshot);
        const pests = state.journalPests
          .filter((p) => p.journalId === j.id)
          .map((p) => pestName(p.pestId));
        const haystack = [
          String(j.journalNumber), customer?.name ?? '', j.siteAddress ?? '',
          ...materials, ...pests, j.startedAt.slice(0, 10),
        ].join(' ');
        return normalize(haystack).includes(q);
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [state, query, filter]);

  return (
    <>
      <Card>
        <Field label="חיפוש יומן" htmlFor="j-search" hint="מספר, לקוח, כתובת, חומר, מזיק או תאריך.">
          <input
            id="j-search"
            type="search"
            placeholder="הקלד לחיפוש…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Field>
        <div className="chips">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className="chip"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Card>

      {results.length === 0 ? (
        <Card><EmptyState icon="❑" title="לא נמצאו יומנים תואמים." /></Card>
      ) : (
        <div className="list mt-3">
          {results.map((j) => {
            const customer = state.customers.find((c) => c.id === j.customerId);
            return (
              <div key={j.id} className="card" style={{ padding: 0 }}>
                <button
                  type="button"
                  className="list-row"
                  style={{ border: 'none' }}
                  onClick={() => navigate(`#/journal/${j.id}/${j.lastStep || 1}`)}
                >
                  <span className="grow">
                    <span className="ttl">{journalNumberText(j.journalNumber)} · {customer?.name ?? 'ללא לקוח'}</span>
                    <span className="sub">{formatDateTime(j.startedAt)} · {j.siteAddress || 'ללא כתובת'}</span>
                  </span>
                  <Tag kind={j.status === 'draft' ? 'warn' : j.status === 'cancelled' ? 'error' : 'ok'}>
                    {JOURNAL_STATUS_LABEL[j.status]}
                  </Tag>
                </button>
                <div className="row" style={{ padding: '0 12px 12px' }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`#/doc/${j.id}`)}>
                    מסמך ו-PDF
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const copy = duplicateJournal(j.id);
                      if (copy) navigate(`#/journal/${copy.id}/1`);
                    }}
                  >
                    שכפול מבוקר
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
