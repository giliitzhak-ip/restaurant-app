import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ListOrdered, Lock, LockOpen, Map as MapIcon, Play, Plus, Trash2, Wand2 } from 'lucide-react';
import { useApp } from '@/state/AppContext';
import { useToast } from '@/state/ToastContext';
import { Alert, EmptyState, PoisonNotice } from '@/components/Common';
import { SkeletonList } from '@/components/Skeleton';
import { useRouteBundle } from './useRouteBundle';
import { StatusChip, ContactActions } from './components';
import { applyReorder, patchVisit, removeVisit, saveRoute, saveVisit } from '@/lib/routes/actions';
import { autoOrderVisits, estimateSchedule, moveItem } from '@/lib/routes/ordering';
import { formatDurationHe, isVisitLate, nextVisit, routeProgress, visitAlertLabel, visitTone } from '@/lib/routes/status';
import { siteAddressText, siteCoordinates } from '@/lib/routes/prefill';
import { listOrgMembers, type OrgMember } from '@/lib/routes/repo';
import type { RouteVisitRow } from '@/lib/routes/types';
import { ROUTE_KIND_LABELS, ROUTE_STATUS_LABELS, VISIT_PRIORITY_LABELS } from '@/schema/routes';
import { formatDateHe, serverNow, serverNowIso } from '@/lib/time';
import { newUuid } from '@/lib/ids';
import { prefersReducedMotion } from '@/components/motion/motion';

/**
 * מסך מסלול העבודה של יום אחד.
 *
 * התחנות מוצגות כציר: מספר בעיגול, קו אנכי שמחבר ביניהן, והתחנה
 * הנוכחית מסומנת. כל הפעולות אמיתיות — שינוי סדר, הוספה והסרה של
 * לקוח, דחייה, סימון דחיפות ופתיחת טיפול — ונשמרות גם בלי קליטה.
 */
export function RouteDayPage(): React.JSX.Element {
  const { routeId } = useParams<{ routeId: string }>();
  const navigate = useNavigate();
  const { profile, reference, syncEngine } = useApp();
  const { showToast } = useToast();
  const { bundle, loading, offline, error, reload, apply } = useRouteBundle(routeId);

  const [reordering, setReordering] = useState(false);
  const [orderDraft, setOrderDraft] = useState<string[]>([]);
  const [autoOrderNote, setAutoOrderNote] = useState<string | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [adding, setAdding] = useState(false);
  const [newClientId, setNewClientId] = useState('');
  const [newSiteId, setNewSiteId] = useState('');
  const [insertAfter, setInsertAfter] = useState('');
  const [busy, setBusy] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const nextCardRef = useRef<HTMLLIElement | null>(null);

  const isAdmin = profile?.role === 'owner' || profile?.role === 'manager';
  const now = serverNow();

  useEffect(() => {
    void listOrgMembers()
      .then(setMembers)
      .catch(() => setMembers([]));
  }, []);

  const clientsById = useMemo(
    () => new Map(reference.clients.map((client) => [client.id, client])),
    [reference.clients],
  );
  const sitesById = useMemo(() => new Map(reference.sites.map((site) => [site.id, site])), [reference.sites]);

  const visits = useMemo(() => {
    const list = bundle?.visits ?? [];
    return [...list].sort((a, b) => a.position - b.position);
  }, [bundle]);

  const orderedVisits = useMemo(() => {
    if (!reordering) return visits;
    const byId = new Map(visits.map((visit) => [visit.id, visit]));
    return orderDraft.map((id) => byId.get(id)).filter((visit): visit is RouteVisitRow => Boolean(visit));
  }, [orderDraft, reordering, visits]);

  /** נקודת ציון לתחנה: מהביקור עצמו, ואם אין — מהאתר השמור. */
  const coordinatesFor = useCallback(
    (visit: RouteVisitRow) => {
      if (typeof visit.latitude === 'number' && typeof visit.longitude === 'number') {
        return { latitude: visit.latitude, longitude: visit.longitude };
      }
      return siteCoordinates(visit.clientSiteId ? sitesById.get(visit.clientSiteId) : null);
    },
    [sitesById],
  );

  const orderableVisits = useMemo(
    () =>
      orderedVisits.map((visit) => {
        const point = coordinatesFor(visit);
        return {
          id: visit.id,
          position: visit.position,
          latitude: point?.latitude ?? null,
          longitude: point?.longitude ?? null,
          priority: visit.priority,
          timeWindowStart: visit.timeWindowStart,
          timeWindowEnd: visit.timeWindowEnd,
          estimatedDurationMinutes: visit.estimatedDurationMinutes,
        };
      }),
    [coordinatesFor, orderedVisits],
  );

  const schedule = useMemo(
    () =>
      estimateSchedule(orderableVisits, {
        startPoint: bundle?.route.startPointCoordinates ?? null,
        startTime: bundle?.route.startTime ?? null,
      }),
    [bundle?.route.startPointCoordinates, bundle?.route.startTime, orderableVisits],
  );

  const progress = useMemo(() => routeProgress(visits, now), [visits, now]);
  const upcoming = useMemo(() => nextVisit(visits), [visits]);

  // גלילה חלקה לתחנה הבאה כשהיא מתחלפת.
  useEffect(() => {
    if (!upcoming || reordering || !nextCardRef.current) return;
    nextCardRef.current.scrollIntoView({
      block: 'center',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
    // התלות היא במזהה בלבד: תלות באובייקט כולו הייתה מגלגלת את המסך
    // בכל עדכון מקומי של התחנות, גם כשהתחנה הבאה לא השתנתה.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcoming?.id, reordering]);

  const startRoute = async () => {
    if (!bundle) return;
    setBusy(true);
    try {
      const updated = { ...bundle.route, status: 'active' as const, startedAt: bundle.route.startedAt ?? serverNowIso() };
      apply((current) => ({ ...current, route: updated }));
      await saveRoute(syncEngine, updated);
      showToast('המסלול התחיל', 'success');
    } finally {
      setBusy(false);
    }
  };

  const toggleLock = async () => {
    if (!bundle) return;
    const updated = { ...bundle.route, orderLocked: !bundle.route.orderLocked };
    apply((current) => ({ ...current, route: updated }));
    await saveRoute(syncEngine, updated);
    showToast(updated.orderLocked ? 'סדר המסלול ננעל' : 'סדר המסלול נפתח לעריכה', 'success');
  };

  const beginReorder = () => {
    if (bundle?.route.orderLocked && !isAdmin) {
      showToast('סדר המסלול נעול. פתיחה מחדש מחייבת הרשאת מנהל.', 'error');
      return;
    }
    setOrderDraft(visits.map((visit) => visit.id));
    setAutoOrderNote(null);
    setReordering(true);
  };

  const move = (from: number, to: number) => {
    setOrderDraft((current) => moveItem(current, from, to));
  };

  const runAutoOrder = () => {
    const result = autoOrderVisits(orderableVisits, {
      startPoint: bundle?.route.startPointCoordinates ?? null,
    });
    setOrderDraft(result.order);
    setAutoOrderNote(
      result.withoutCoordinates.length > 0
        ? `${result.explanation} ${result.withoutCoordinates.length} תחנות ללא נקודת ציון נשארו בסוף, בסדר הידני שלהן.`
        : result.explanation,
    );
  };

  const saveOrder = async () => {
    if (!routeId) return;
    setBusy(true);
    try {
      await applyReorder(syncEngine, routeId, orderDraft);
      apply((current) => ({
        ...current,
        visits: orderDraft
          .map((id, index) => {
            const visit = current.visits.find((item) => item.id === id);
            return visit ? { ...visit, position: index + 1 } : null;
          })
          .filter((visit): visit is RouteVisitRow => visit !== null),
      }));
      setReordering(false);
      showToast('הסדר החדש נשמר', 'success');
    } catch (saveError) {
      showToast(saveError instanceof Error ? saveError.message : 'שמירת הסדר נכשלה', 'error', {
        label: 'נסה שוב',
        onClick: () => void saveOrder(),
      });
    } finally {
      setBusy(false);
    }
  };

  const addVisit = async () => {
    if (!bundle || !profile || !newClientId) return;
    setBusy(true);
    try {
      const afterPosition = insertAfter
        ? (visits.find((visit) => visit.id === insertAfter)?.position ?? visits.length)
        : visits.length;
      const site = newSiteId ? sitesById.get(newSiteId) : null;
      const point = siteCoordinates(site);
      const visit: RouteVisitRow = {
        id: newUuid(),
        organizationId: profile.organizationId,
        routeId: bundle.route.id,
        clientId: newClientId,
        clientSiteId: newSiteId || null,
        position: afterPosition + 1,
        plannedDate: bundle.route.routeDate,
        plannedStartTime: null,
        timeWindowStart: null,
        timeWindowEnd: null,
        estimatedDurationMinutes: null,
        serviceType: null,
        frequencyDays: null,
        priority: 'normal',
        status: 'pending',
        assignedUserId: bundle.route.assignedUserId,
        assignedVehicleId: bundle.route.vehicle,
        arrivalAt: null,
        startedAt: null,
        completedAt: null,
        latitude: point?.latitude ?? null,
        longitude: point?.longitude ?? null,
        linkedPestLogId: null,
        completionNotes: null,
        followUpRequired: false,
        postponedToDate: null,
        postponeReason: null,
        internalNotes: null,
        updatedAt: serverNowIso(),
      };

      // הכנסה באמצע: כל מי שאחרי נדחף מקום אחד.
      const shifted = visits.map((item) =>
        item.position > afterPosition ? { ...item, position: item.position + 1 } : item,
      );
      apply((current) => ({ ...current, visits: [...shifted, visit].sort((a, b) => a.position - b.position) }));
      await saveVisit(syncEngine, visit);
      for (const item of shifted) {
        if (item.position !== visits.find((original) => original.id === item.id)?.position) {
          await saveVisit(syncEngine, item);
        }
      }
      setAdding(false);
      setNewClientId('');
      setNewSiteId('');
      setInsertAfter('');
      showToast('הלקוח נוסף למסלול', 'success');
    } finally {
      setBusy(false);
    }
  };

  const dropVisit = async (visit: RouteVisitRow) => {
    const confirmed = globalThis.confirm(
      `להסיר את ${clientsById.get(visit.clientId)?.name ?? 'הלקוח'} מהמסלול? הלקוח יישאר במאגר הלקוחות.`,
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      apply((current) => ({ ...current, visits: current.visits.filter((item) => item.id !== visit.id) }));
      await removeVisit(syncEngine, visit);
      showToast('התחנה הוסרה מהמסלול', 'success');
    } finally {
      setBusy(false);
    }
  };

  const togglePriority = async (visit: RouteVisitRow) => {
    const priority = visit.priority === 'urgent' ? 'normal' : 'urgent';
    const updated = await patchVisit(syncEngine, visit, { priority });
    apply((current) => ({
      ...current,
      visits: current.visits.map((item) => (item.id === visit.id ? updated : item)),
    }));
    showToast(priority === 'urgent' ? 'הביקור סומן כדחוף' : 'סימון הדחיפות הוסר', 'success');
  };

  const postpone = async (visit: RouteVisitRow) => {
    const date = globalThis.prompt('לדחות את הביקור לתאריך (YYYY-MM-DD):', visit.plannedDate);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      if (date !== null) showToast('תאריך לא תקין', 'error');
      return;
    }
    const reason = globalThis.prompt('סיבת הדחייה:') ?? '';
    const updated = await patchVisit(syncEngine, visit, {
      status: 'postponed',
      postponedToDate: date,
      postponeReason: reason || null,
    });
    apply((current) => ({
      ...current,
      visits: current.visits.map((item) => (item.id === visit.id ? updated : item)),
    }));
    showToast('הביקור נדחה ונרשם בהיסטוריה', 'success');
  };

  if (loading) return <SkeletonList rows={4} />;
  if (error || !bundle) {
    return (
      <>
        <PoisonNotice />
        <Alert kind="error" title="לא ניתן לטעון את המסלול">
          {error ?? 'המסלול לא נמצא.'}
        </Alert>
        <button type="button" className="btn" onClick={() => navigate('/routes')}>
          חזרה לרשימת המסלולים
        </button>
      </>
    );
  }

  const { route } = bundle;
  const assignee = members.find((member) => member.id === route.assignedUserId);

  return (
    <>
      <PoisonNotice />

      {offline ? (
        <Alert kind="warning" title="עובדים ללא קליטה">
          המסלול מוצג מהעותק שנשמר במכשיר. סימון הגעה, התחלת טיפול וסיום נשמרים מקומית ויסונכרנו כשהחיבור
          יחזור. ניווט ועדכוני תנועה אינם זמינים ללא חיבור.
        </Alert>
      ) : null}

      <section className="card route-header">
        <div className="route-header-top">
          <div>
            <h2>{route.name}</h2>
            <p className="small muted">
              {formatDateHe(route.routeDate)} · {ROUTE_KIND_LABELS[route.routeKind]}
              {route.areaName ? ` · ${route.areaName}` : ''}
            </p>
            <p className="small muted">
              {assignee ? `עובד אחראי: ${assignee.fullName}` : route.teamName ? `צוות: ${route.teamName}` : 'ללא שיוך'}
              {route.vehicle ? ` · רכב: ${route.vehicle}` : ''}
            </p>
          </div>
          <span className={`tag ${route.status === 'active' ? 'tag-brand' : ''}`}>{ROUTE_STATUS_LABELS[route.status]}</span>
        </div>

        <dl className="route-stats">
          <div>
            <dt>תחנות</dt>
            <dd>{progress.total}</dd>
          </div>
          <div>
            <dt>הושלמו</dt>
            <dd>{progress.completed}</dd>
          </div>
          <div>
            <dt>נותרו</dt>
            <dd>{progress.remaining}</dd>
          </div>
          <div>
            <dt>זמן משוער לסיום</dt>
            <dd>{schedule.estimatedFinish ?? formatDurationHe(progress.remainingMinutes)}</dd>
          </div>
          <div>
            <dt>מרחק משוער</dt>
            <dd>{schedule.totalDistanceKm === null ? '—' : `${schedule.totalDistanceKm} ק״מ`}</dd>
          </div>
        </dl>

        {schedule.missingCoordinates > 0 ? (
          <p className="small dim">
            ל-{schedule.missingCoordinates} תחנות אין נקודת ציון, ולכן המרחק והזמן הם הערכה חלקית. המרחק הוא
            קו אווירי ולא מרחק נסיעה.
          </p>
        ) : (
          <p className="small dim">המרחק והזמן הם הערכה לפי קו אווירי במהירות ממוצעת, ולא לפי מנוע ניתוב.</p>
        )}

        <div className="btn-row">
          {route.status !== 'completed' ? (
            <button type="button" className="btn btn-primary" onClick={() => void startRoute()} disabled={busy || route.status === 'active'}>
              <Play size={16} aria-hidden="true" /> {route.status === 'active' ? 'המסלול פעיל' : 'התחלת מסלול'}
            </button>
          ) : null}
          <button type="button" className="btn" onClick={() => navigate(`/routes/${route.id}/map`)}>
            <MapIcon size={16} aria-hidden="true" /> הצגה במפה
          </button>
          <button type="button" className="btn" onClick={beginReorder} disabled={reordering}>
            <ListOrdered size={16} aria-hidden="true" /> עריכת סדר
          </button>
          <button type="button" className="btn btn-sm" onClick={() => navigate(`/routes/${route.id}/report`)}>
            דוח מסלול
          </button>
          {isAdmin ? (
            <button type="button" className="btn btn-sm" onClick={() => void toggleLock()}>
              {route.orderLocked ? <LockOpen size={16} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
              {route.orderLocked ? ' פתיחת הסדר' : ' נעילת הסדר'}
            </button>
          ) : null}
        </div>
      </section>

      {reordering ? (
        <section className="card">
          <h3>עריכת סדר התחנות</h3>
          <p className="small muted">
            ניתן לגרור תחנה למקומה, או להשתמש בחצים — כדי שהעריכה תעבוד גם במקלדת וגם בקורא מסך.
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn-sm" onClick={runAutoOrder}>
              <Wand2 size={16} aria-hidden="true" /> סידור מסלול אוטומטי
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveOrder()} disabled={busy}>
              שמירת הסדר
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setReordering(false)} disabled={busy}>
              ביטול
            </button>
          </div>
          {autoOrderNote ? (
            <Alert kind="info" title="סידור בסיסי לפי מרחק אווירי">
              {autoOrderNote}
            </Alert>
          ) : null}
        </section>
      ) : null}

      {visits.length === 0 ? (
        <EmptyState>אין עדיין תחנות במסלול. אפשר להוסיף לקוח כדי להתחיל.</EmptyState>
      ) : (
        <ol className="route-timeline" data-testid="route-timeline">
          {orderedVisits.map((visit, index) => {
            const client = clientsById.get(visit.clientId);
            const site = visit.clientSiteId ? sitesById.get(visit.clientSiteId) : null;
            const address = siteAddressText(site, client?.address ?? null);
            const point = coordinatesFor(visit);
            const tone = visitTone(visit, now);
            const alert = visitAlertLabel(visit, now);
            const estimate = schedule.entries.find((entry) => entry.visitId === visit.id);
            const isNext = upcoming?.id === visit.id;

            return (
              <li
                key={visit.id}
                className={`route-stop tone-${tone}${isNext ? ' is-current' : ''}${visit.status === 'completed' ? ' is-done' : ''}`}
                ref={isNext ? nextCardRef : null}
                data-testid={`visit-${visit.id}`}
                draggable={reordering}
                onDragStart={() => {
                  dragIndex.current = index;
                }}
                onDragOver={(event) => {
                  if (reordering) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragIndex.current === null) return;
                  move(dragIndex.current, index);
                  dragIndex.current = null;
                }}
              >
                <span className="route-stop-index" aria-hidden="true">
                  {index + 1}
                </span>

                <div className="route-stop-body">
                  <div className="route-stop-head">
                    <h3>{client?.name ?? 'לקוח שאינו במטמון'}</h3>
                    <StatusChip status={visit.status} tone={tone} alert={alert} />
                  </div>

                  <p className="small muted">
                    {site?.label ? `${site.label} · ` : ''}
                    {address ?? 'אין כתובת שמורה'}
                  </p>
                  <p className="small dim">
                    {visit.plannedStartTime ? `שעה מתוכננת ${visit.plannedStartTime}` : 'ללא שעה מתוכננת'}
                    {visit.timeWindowStart && visit.timeWindowEnd
                      ? ` · חלון זמן ${visit.timeWindowStart}–${visit.timeWindowEnd}`
                      : ''}
                    {estimate?.estimatedArrival ? ` · הגעה משוערת ${estimate.estimatedArrival}` : ''}
                  </p>
                  <p className="small dim">
                    {visit.serviceType ? `שירות: ${visit.serviceType}` : 'סוג שירות לא הוגדר'}
                    {visit.frequencyDays ? ` · תדירות: כל ${visit.frequencyDays} ימים` : ''}
                    {` · דחיפות: ${VISIT_PRIORITY_LABELS[visit.priority]}`}
                    {estimate?.travelMinutes !== null && estimate?.travelMinutes !== undefined
                      ? ` · נסיעה משוערת מהתחנה הקודמת: ${estimate.travelMinutes} דק׳`
                      : ''}
                  </p>

                  {reordering ? (
                    <div className="btn-row btn-row-compact">
                      <button
                        type="button"
                        className="btn btn-sm"
                        aria-label={`העברת ${client?.name ?? 'התחנה'} מקום אחד למעלה`}
                        onClick={() => move(index, index - 1)}
                        disabled={index === 0}
                      >
                        <ArrowUp size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        aria-label={`העברת ${client?.name ?? 'התחנה'} מקום אחד למטה`}
                        onClick={() => move(index, index + 1)}
                        disabled={index === orderedVisits.length - 1}
                      >
                        <ArrowDown size={16} aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <ContactActions
                        compact
                        target={{
                          latitude: point?.latitude ?? null,
                          longitude: point?.longitude ?? null,
                          address,
                          phone: client?.phone ?? null,
                          mobile: client?.mobile ?? null,
                          clientName: client?.name ?? '',
                        }}
                      />
                      <div className="btn-row btn-row-compact">
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() => navigate(`/routes/${route.id}/visits/${visit.id}`)}
                        >
                          {visit.status === 'completed' ? 'פתיחת הביקור' : 'התחלת טיפול'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => navigate(`/clients?client=${visit.clientId}`)}
                        >
                          פתיחת הלקוח
                        </button>
                        <button type="button" className="btn btn-sm" onClick={() => void togglePriority(visit)}>
                          {visit.priority === 'urgent' ? 'ביטול דחיפות' : 'סימון כדחוף'}
                        </button>
                        <button type="button" className="btn btn-sm" onClick={() => void postpone(visit)}>
                          דחיית ביקור
                        </button>
                        {visit.status === 'pending' ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => void dropVisit(visit)}
                            aria-label={`הסרת ${client?.name ?? 'התחנה'} מהמסלול`}
                          >
                            <Trash2 size={16} aria-hidden="true" /> הסרה
                          </button>
                        ) : null}
                      </div>
                    </>
                  )}

                  {isVisitLate(visit, now) ? (
                    <p className="small tag tag-danger">הביקור באיחור מול הזמן המתוכנן.</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <section className="card">
        <h3>הוספת לקוח למסלול</h3>
        {adding ? (
          <>
            <div className="field">
              <label htmlFor="route-add-client">לקוח</label>
              <select id="route-add-client" value={newClientId} onChange={(event) => setNewClientId(event.target.value)}>
                <option value="">בחירת לקוח</option>
                {reference.clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="route-add-site">אתר</label>
              <select id="route-add-site" value={newSiteId} onChange={(event) => setNewSiteId(event.target.value)}>
                <option value="">ללא אתר מסוים</option>
                {reference.sites
                  .filter((site) => !newClientId || site.clientId === newClientId)
                  .map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.label}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="route-add-after">מיקום במסלול</label>
              <select id="route-add-after" value={insertAfter} onChange={(event) => setInsertAfter(event.target.value)}>
                <option value="">בסוף המסלול</option>
                {visits.map((visit) => (
                  <option key={visit.id} value={visit.id}>
                    אחרי תחנה {visit.position} — {clientsById.get(visit.clientId)?.name ?? ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="btn-row">
              <button type="button" className="btn btn-primary" onClick={() => void addVisit()} disabled={!newClientId || busy}>
                הוספה
              </button>
              <button type="button" className="btn" onClick={() => setAdding(false)}>
                ביטול
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            <Plus size={16} aria-hidden="true" /> הוספת לקוח
          </button>
        )}
      </section>

      <button type="button" className="btn btn-sm" onClick={() => void reload()}>
        רענון מהשרת
      </button>
    </>
  );
}
