import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { Card, EmptyState, Field, Notice, Tag } from '../components/ui';
import { navigate } from '../router';
import { STOP_STATUS_LABEL, formatDate, toDateInput } from '../lib/format';
import { pestName } from '../data/pests';
import { suggestedOrder } from '../lib/routeOrder';
import type { StopStatus } from '../types';

const STATUS_FLOW: StopStatus[] = ['pending', 'on_the_way', 'in_progress', 'done', 'postponed'];

export function RouteScreen() {
  const {
    state, createRoute, addRouteStop, updateRouteStop, moveRouteStop, reorderRouteStops,
    removeRouteStop, createJournal, updateJournal,
  } = useStore();
  const [date, setDate] = useState(() => toDateInput(new Date().toISOString()));
  const [pickCustomer, setPickCustomer] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);

  const route = useMemo(() => state.routes.find((r) => r.date === date), [state.routes, date]);
  const stops = useMemo(
    () =>
      route
        ? state.routeStops.filter((s) => s.routeId === route.id).sort((a, b) => a.position - b.position)
        : [],
    [state.routeStops, route],
  );

  // עותק עדכני של התחנות לשימוש בתוך מטפלי הגרירה, בלי לקרוא ל-ref בזמן רינדור
  const stopsRef = useRef(stops);
  useEffect(() => {
    stopsRef.current = stops;
  }, [stops]);

  /**
   * גרירה מבוססת Pointer Events – עובדת גם במגע בטלפון וגם בעכבר במחשב,
   * בניגוד ל-HTML5 drag and drop שאינו נתמך במגע.
   * לצד הגרירה נשארים כפתורי הקדמה/איחור וחצי המקלדת, לנגישות מלאה.
   */
  const startDrag = useCallback((e: React.PointerEvent<HTMLButtonElement>, stopId: string) => {
    e.preventDefault();
    dragIdRef.current = stopId;
    setDragId(stopId);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onDragMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const dragging = dragIdRef.current;
    if (!dragging) return;
    const element = document.elementFromPoint(e.clientX, e.clientY);
    const target = element?.closest<HTMLElement>('[data-stop-id]');
    const overId = target?.dataset.stopId;
    if (!overId || overId === dragging) return;

    const ids = stopsRef.current.map((st) => st.id);
    const from = ids.indexOf(dragging);
    const to = ids.indexOf(overId);
    if (from === -1 || to === -1) return;
    ids.splice(from, 1);
    ids.splice(to, 0, dragging);
    reorderRouteStops(stopsRef.current[0].routeId, ids);
  }, [reorderRouteStops]);

  const endDrag = useCallback(() => {
    dragIdRef.current = null;
    setDragId(null);
  }, []);

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
            {stops.length > 1 && (
              <button
                type="button"
                className="btn btn-ghost mt-2"
                onClick={() => {
                  const addressed = stops.map((st) => ({
                    id: st.id,
                    address:
                      state.sites.find((si) => si.id === st.siteId)?.address ??
                      state.customers.find((c) => c.id === st.customerId)?.address ??
                      '',
                  }));
                  reorderRouteStops(route.id, suggestedOrder(addressed));
                }}
              >
                סדר מומלץ לפי כתובות
              </button>
            )}
            {state.customers.length === 0 && (
              <Notice kind="warn">אין עדיין לקוחות. יש להוסיף לקוח לפני בניית מסלול.</Notice>
            )}
            {stops.length > 1 && (
              <p className="hint">
                הסדר המומלץ מקבץ כתובות קרובות. אפשר לשנות אותו בגרירה או בכפתורי ההקדמה והאיחור.
              </p>
            )}
          </>
        )}
      </Card>

      {route && stops.length > 1 && (
        <Card>
          <div className="card-title">
            <h3>סדר התחנות</h3>
            <span className="tag tag-muted">{stops.length} תחנות</span>
          </div>
          <p className="hint mb-3">
            גררו את הידית כדי לשנות סדר, או השתמשו בחצים. הסדר נשמר אוטומטית.
          </p>
          <ol className="reorder-list">
            {stops.map((stop, index) => {
              const customer = state.customers.find((c) => c.id === stop.customerId);
              return (
                <li
                  key={stop.id}
                  data-stop-id={stop.id}
                  className={`reorder-row ${dragId === stop.id ? 'dragging' : ''}`}
                >
                  <button
                    type="button"
                    className="drag-handle"
                    aria-label={`שינוי מיקום של ${customer?.name ?? 'תחנה'}. גררו, או השתמשו בחצי המקלדת.`}
                    onPointerDown={(e) => startDrag(e, stop.id)}
                    onPointerMove={onDragMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp') { e.preventDefault(); moveRouteStop(stop.routeId, stop.id, -1); }
                      if (e.key === 'ArrowDown') { e.preventDefault(); moveRouteStop(stop.routeId, stop.id, 1); }
                    }}
                  >
                    <span aria-hidden="true">⠿</span>
                  </button>
                  <span className="grow">
                    <span className="bold">{index + 1}. {customer?.name ?? 'לקוח'}</span>
                    <span className="small muted"> · {STOP_STATUS_LABEL[stop.status]}</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label="הקדם תחנה"
                    disabled={index === 0}
                    onClick={() => moveRouteStop(stop.routeId, stop.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label="אחר תחנה"
                    disabled={index === stops.length - 1}
                    onClick={() => moveRouteStop(stop.routeId, stop.id, 1)}
                  >
                    ↓
                  </button>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

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
          <div
            key={stop.id}
            data-stop-id={stop.id}
            className={dragId === stop.id ? 'dragging' : undefined}
          >
          <Card>
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
          </div>
        );
      })}
    </>
  );
}
