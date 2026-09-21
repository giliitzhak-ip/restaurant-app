import { useStore } from '../state/store';
import { Card, Field, Notice } from './ui';
import { newId } from '../lib/id';
import { toDateInput } from '../lib/format';

/** ניהול תיבות האכלה ליומן – מזהה תיבה, מיקום, כמות, קיבוע ומועד ביקורת. */
export function BaitStations({ journalId, customerId }: { journalId: string; customerId?: string }) {
  const { state, upsertBaitStation, removeBaitStation } = useStore();
  const stations = state.baitStations.filter((b) => b.journalId === journalId);

  function add(): void {
    upsertBaitStation({
      id: newId('bst'),
      journalId,
      customerId: customerId ?? '',
      stationCode: `T-${String(stations.length + 1).padStart(2, '0')}`,
      location: '',
      quantity: '',
      secured: false,
      nextCheckDate: toDateInput(new Date().toISOString()),
    });
  }

  return (
    <Card>
      <div className="card-title">
        <h3>תיבות האכלה</h3>
        <span className="tag tag-muted">{stations.length} תיבות</span>
      </div>

      <Notice kind="info">
        טיפול בפיתיון בתיבות האכלה. יש לתעד כל תיבה בנפרד ולפעול לפי הוראות הבטיחות שבתווית הרשמית.
      </Notice>

      {stations.map((st) => (
        <div key={st.id} className="card" style={{ background: 'var(--surface-2)' }}>
          <div className="row">
            <Field label="מזהה תיבה" htmlFor={`code-${st.id}`}>
              <input
                id={`code-${st.id}`}
                type="text"
                value={st.stationCode}
                onChange={(e) => upsertBaitStation({ ...st, stationCode: e.target.value })}
              />
            </Field>
            <Field label="מיקום" htmlFor={`loc-${st.id}`}>
              <input
                id={`loc-${st.id}`}
                type="text"
                value={st.location}
                onChange={(e) => upsertBaitStation({ ...st, location: e.target.value })}
              />
            </Field>
          </div>
          <div className="row">
            <Field label="כמות פיתיון" htmlFor={`qty-${st.id}`}>
              <input
                id={`qty-${st.id}`}
                type="text"
                inputMode="decimal"
                value={st.quantity}
                onChange={(e) => upsertBaitStation({ ...st, quantity: e.target.value })}
              />
            </Field>
            <Field label="מועד ביקורת" htmlFor={`chk-${st.id}`}>
              <input
                id={`chk-${st.id}`}
                type="date"
                value={st.nextCheckDate ?? ''}
                onChange={(e) => upsertBaitStation({ ...st, nextCheckDate: e.target.value })}
              />
            </Field>
          </div>
          <label className="check-line">
            <input
              type="checkbox"
              checked={st.secured}
              onChange={(e) => upsertBaitStation({ ...st, secured: e.target.checked })}
            />
            התיבה מקובעת ונעולה
          </label>
          <div className="mt-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeBaitStation(st.id)}>
              הסר תיבה
            </button>
          </div>
        </div>
      ))}

      <button type="button" className="btn btn-soft mt-3" onClick={add}>+ הוסף תיבה</button>
    </Card>
  );
}
