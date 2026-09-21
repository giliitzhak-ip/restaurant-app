import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { Card, EmptyState, Field, Notice, Tag } from '../components/ui';
import { navigate } from '../router';
import { STOP_STATUS_LABEL, formatDate, toDateInput } from '../lib/format';
import { pestName } from '../data/pests';
import type { StopStatus } from '../types';

const STATUS_FLOW: StopStatus[] = ['pending', 'on_the_way', 'in_progress', 'done', 'postponed'];

export function RouteScreen() {
  const {
    state, createRoute, addRouteStop, updateRouteStop, moveRouteStop, removeRouteStop,
    createJournal, updateJournal,
  } = useStore();
  const [date, setDate] = useState(() => toDateInput(new Date().toISOString()));
  const [pickCustomer, setPickCustomer] = useState('');

  const route = useMemo(() => state.routes.find((r) => r.date === date), [state.routes, date]);
  const stops = useMemo(
    () =>
      route
        ? state.routeStops.filter((s) => s.routeId === route.id).sort((a, b) => a.position - b.position)
        : [],
    [state.routeStops, route],
  );

  function openJournalForStop(stopId: string, customerId: string): void {
    const customer = state.customers.find((c) => c.id === customerId);
    const site = state.sites.find((s) => s.customerId === customerId);
    const journal = createJournal();
    updateJournal(journal.id, {
      customerId,
      siteId: site?.id,
      siteAddress: site?.address ?? customer?.address,
      siteKind: site?.siteKind ?? 'apartment',
      siteAccessNotes: site?.accessNotes,
      visitKind: 'followup',
    });
    updateRouteStop(stopId, { journalId: journal.id, status: 'in_progress' });
    navigate(`#/journal/${journal.id}/1`);
  }

  /** בסיום טיפול: סימון התחנה כהושלמה ומעבר ללקוח הבא. */
  function completeStop(stopId: string): void {
    updateRouteStop(stopId, { status: 'done' });
    const idx = stops.findIndex((s) => s.id === stopId);
    const next = stops.slice(idx + 1).find((s) => s.status === 'pending');
    if (next) updateRouteStop(next.id, { status: 'on_the_way' });
  }

  return (
    <>
      <Card>
        <div className="card-title"><h2>מסלול עבודה</h2></div>
        <Field label="תאריך המסלול" htmlFor="route-date">
          <input id="route-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        {!route ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              createRoute({
                date,
                name: `מסלול ${formatDate(new Date(date).toISOString())}`,
                exterminatorId: state.exterminators[0]?.id ?? 'ext_yizhak',
              })
            }
          >
            צור מסלול ליום זה
          </button>
        ) : (
          <>
            <Field label="הוספת לקוח למסלול" htmlFor="route-add">
              <select id="route-add" value={pickCustomer} onChange={(e) => setPickCustomer(e.target.value)}>
                <option value="">בחר לקוח…</option>
                {state.customers.filter((c) => !c.archived).map((c) => (
                  <option key={c.id} value={c.id}>{c.name} · {c.address}</option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              className="btn btn-soft"
              disabled={!pickCustomer}
              onClick={() => {
                const site = state.sites.find((s) => s.customerId === pickCustomer);
                addRouteStop(route.id, pickCustomer, site?.id);
                setPickCustomer('');
              }}
            >
              + הוסף תחנה
            </button>
            {state.customers.length === 0 && (
              <Notice kind="warn">אין עדיין לקוחות. יש להוסיף לקוח לפני בניית מסלול.</Notice>
            )}
          </>
        )}
      </Card>

      {route && stops.length === 0 && (
        <Card><EmptyState icon="⇄" title="המסלול ריק. הוסיפו לקוחות וסדרו את סדר התחנות." /></Card>
      )}

      {stops.map((stop, index) => {
        const customer = state.customers.find((c) => c.id === stop.customerId);
        const site = state.sites.find((s) => s.id === stop.siteId);
        const address = site?.address ?? customer?.address ?? '';
        const lastJournal = state.journals
          .filter((j) => j.customerId === stop.customerId && j.status !== 'draft')
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
        const lastPests = state.journalPests
          .filter((p) => p.journalId === lastJournal?.id)
          .map((p) => pestName(p.pestId));
        const lastMaterial = state.journalMaterials.find((m) => m.journalId === lastJournal?.id);
        const openTasks = state.tasks.filter((t) => t.customerId === stop.customerId && !t.done);
        const stations = state.baitStations.filter((b) => b.customerId === stop.customerId);

        return (
          <Card key={stop.id}>
            <div className="card-title">
              <h3>{index + 1}. {customer?.name ?? 'לקוח'}</h3>
              <Tag kind={stop.status === 'done' ? 'ok' : stop.status === 'postponed' ? 'error' : 'muted'}>
                {STOP_STATUS_LABEL[stop.status]}
              </Tag>
            </div>

            <p className="small muted">{address}</p>

            <div className="row">
              <Field label="שעה מתוכננת" htmlFor={`time-${stop.id}`}>
                <input
                  id={`time-${stop.id}`}
                  type="time"
                  value={stop.plannedTime ?? ''}
                  onChange={(e) => updateRouteStop(stop.id, { plannedTime: e.target.value })}
                />
              </Field>
              <Field label="משך משוער (דקות)" htmlFor={`dur-${stop.id}`}>
                <input
                  id={`dur-${stop.id}`}
                  type="number"
                  min={5}
                  step={5}
                  value={stop.estimatedMinutes ?? ''}
                  onChange={(e) => updateRouteStop(stop.id, { estimatedMinutes: Number(e.target.value) })}
                />
              </Field>
            </div>

            <Field label="במה להתמקד" htmlFor={`focus-${stop.id}`}>
              <input
                id={`focus-${stop.id}`}
                type="text"
                value={stop.focusNote ?? ''}
                onChange={(e) => updateRouteStop(stop.id, { focusNote: e.target.value })}
              />
            </Field>

            <div className="card" style={{ background: 'var(--surface-2)' }}>
              <div className="small">
                <div><span className="bold">טיפול אחרון:</span> {lastJournal ? formatDate(lastJournal.startedAt) : '—'}</div>
                <div><span className="bold">מפגעים חוזרים:</span> {lastPests.length ? lastPests.join(', ') : '—'}</div>
                <div><span className="bold">חומר מועדף:</span> {lastMaterial?.materialNameSnapshot ?? '—'}</div>
                <div><span className="bold">תיבות קיימות:</span> {stations.length || '—'}</div>
                <div><span className="bold">משימות פתוחות:</span> {openTasks.length || '—'}</div>
              </div>
            </div>

            <div className="field mt-3">
              <span className="field-label">סטטוס תחנה</span>
              <div className="chips">
                {STATUS_FLOW.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="chip"
                    aria-pressed={stop.status === s}
                    onClick={() => updateRouteStop(stop.id, { status: s })}
                  >
                    {STOP_STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>

            <div className="row">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => openJournalForStop(stop.id, stop.customerId)}>
                פתח יומן ללקוח
              </button>
              <button type="button" className="btn btn-soft btn-sm" onClick={() => completeStop(stop.id)}>
                סיום טיפול ומעבר לבא
              </button>
              {address && (
                <>
                  <a className="btn btn-ghost btn-sm" href={`https://waze.com/ul?q=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer">
                    ניווט ב-Waze
                  </a>
                  <a className="btn btn-ghost btn-sm" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer">
                    Google Maps
                  </a>
                </>
              )}
              {customer?.phone && <a className="btn btn-ghost btn-sm" href={`tel:${customer.phone}`}>חיוג</a>}
            </div>

            <div className="row mt-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveRouteStop(stop.routeId, stop.id, -1)} disabled={index === 0}>
                ↑ הקדם
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveRouteStop(stop.routeId, stop.id, 1)} disabled={index === stops.length - 1}>
                ↓ אחר
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeRouteStop(stop.id)}>
                הסר תחנה
              </button>
            </div>
          </Card>
        );
      })}
    </>
  );
}
