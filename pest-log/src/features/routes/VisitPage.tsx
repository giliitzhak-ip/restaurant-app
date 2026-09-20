import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, MapPin, Play, Square } from 'lucide-react';
import { useApp } from '@/state/AppContext';
import { useToast } from '@/state/ToastContext';
import { Alert, EmptyState, PoisonNotice } from '@/components/Common';
import { SkeletonList } from '@/components/Skeleton';
import { useRouteBundle } from './useRouteBundle';
import { FocusPanel } from './FocusPanel';
import { ContactActions, StatusChip } from './components';
import { patchVisit, saveFocusItems } from '@/lib/routes/actions';
import { listClientHistory, listVisitHistory, type ClientHistoryLog } from '@/lib/routes/repo';
import { suggestFocusItems } from '@/lib/routes/focus';
import { buildPreviousTreatmentHints, siteAddressText, siteCoordinates } from '@/lib/routes/prefill';
import { attachUploadedPhotos, uploadPendingVisitPhotos } from '@/lib/routes/photos';
import { visitAlertLabel, visitTone } from '@/lib/routes/status';
import { VISIT_COMPLETION_CHECKLIST, type VisitChecklistKey } from '@/schema/routes';
import { listBaitStations, type BaitStationRow, cachedFollowUpTasks, listFollowUpTasks, type FollowUpTask } from '@/lib/repo';
import type { FocusItemRow, RouteVisitRow, VisitHistoryRow } from '@/lib/routes/types';
import { newUuid } from '@/lib/ids';
import { formatDateHe, formatDateTimeHe, serverNow, serverNowIso } from '@/lib/time';

/**
 * ביקור אחד במסלול: כרטיס הלקוח, הדגשים, התחלת טיפול וסיום.
 *
 * פתיחת יומן מהביקור ממלאת אוטומטית רק את פרטי המזמין והמקום. תאריך,
 * שעה, ממצאים, מינונים, אצוות, חתימות ואזהרות אינם מועתקים לעולם —
 * הם שייכים לטיפול הנוכחי בלבד.
 */
export function VisitPage(): React.JSX.Element {
  const { routeId, visitId } = useParams<{ routeId: string; visitId: string }>();
  const navigate = useNavigate();
  const { profile, reference, syncEngine } = useApp();
  const { showToast } = useToast();
  const { bundle, loading, offline, error, apply } = useRouteBundle(routeId);

  const [history, setHistory] = useState<ClientHistoryLog[]>([]);
  const [stations, setStations] = useState<BaitStationRow[]>([]);
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [visitHistory, setVisitHistory] = useState<VisitHistoryRow[]>([]);
  const [checklist, setChecklist] = useState<Record<VisitChecklistKey, boolean>>(
    () => Object.fromEntries(VISIT_COMPLETION_CHECKLIST.map((item) => [item.key, false])) as Record<VisitChecklistKey, boolean>,
  );
  const [completionNotes, setCompletionNotes] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [suggested, setSuggested] = useState(false);

  const visit = useMemo(
    () => bundle?.visits.find((item) => item.id === visitId) ?? null,
    [bundle, visitId],
  );
  const client = useMemo(
    () => reference.clients.find((item) => item.id === visit?.clientId) ?? null,
    [reference.clients, visit?.clientId],
  );
  const site = useMemo(
    () => reference.sites.find((item) => item.id === visit?.clientSiteId) ?? null,
    [reference.sites, visit?.clientSiteId],
  );
  const focusItems = useMemo(
    () => (visit ? (bundle?.focusByVisit[visit.id] ?? []) : []),
    [bundle, visit],
  );

  const address = siteAddressText(site, client?.address ?? null);
  const point = visit && typeof visit.latitude === 'number' && typeof visit.longitude === 'number'
    ? { latitude: visit.latitude, longitude: visit.longitude }
    : siteCoordinates(site);

  const lastLog = history[0] ?? null;

  // ── נתוני כרטיס הלקוח ──
  useEffect(() => {
    if (!visit) return;
    void listClientHistory(visit.clientId).then(setHistory).catch(() => setHistory([]));
    void listBaitStations()
      .then((all) => setStations(all.filter((station) => !visit.clientSiteId || station.clientSiteId === visit.clientSiteId)))
      .catch(() => setStations([]));
    void listFollowUpTasks()
      .then(setTasks)
      .catch(() => void cachedFollowUpTasks().then(setTasks));
    void listVisitHistory(visit.id).then(setVisitHistory).catch(() => setVisitHistory([]));
    // מזהים בלבד: טעינה חוזרת נדרשת רק כשהביקור עצמו מתחלף.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit?.id, visit?.clientId, visit?.clientSiteId]);

  const openTasks = useMemo(
    () => tasks.filter((task) => task.isOpen && task.clientName === client?.name),
    [client?.name, tasks],
  );

  const setFocusItems = useCallback(
    (items: FocusItemRow[]) => {
      if (!visit) return;
      apply((current) => ({
        ...current,
        focusByVisit: { ...current.focusByVisit, [visit.id]: items },
      }));
    },
    [apply, visit],
  );

  // ── הצעת דגשים: פעם אחת, רק אם אין עדיין דגשים לביקור ──
  useEffect(() => {
    if (!visit || !profile || suggested || focusItems.length > 0 || history.length === 0) return;
    setSuggested(true);
    const suggestions = suggestFocusItems({
      lastLog: lastLog ? { ...lastLog, snapshot: lastLog.snapshot ?? {} } : null,
      openTasks: openTasks.map((task) => ({
        logId: task.logId,
        description: task.description,
        targetDate: task.targetDate,
      })),
      baitStations: stations.map((station) => ({
        id: station.id,
        stationNumber: station.stationNumber,
        locationDescription: station.locationDescription,
        status: station.status,
      })),
      serviceType: visit.serviceType,
    });
    if (suggestions.length === 0) return;

    const items: FocusItemRow[] = suggestions.map((suggestion, index) => ({
      id: newUuid(),
      organizationId: profile.organizationId,
      visitId: visit.id,
      category: suggestion.category,
      title: suggestion.title,
      details: suggestion.details,
      siteLocation: null,
      importance: suggestion.importance,
      status: 'to_check',
      source: 'auto_suggested',
      sourceReference: suggestion.sourceReference,
      approved: false,
      approvedAt: null,
      assigneeId: null,
      dueDate: null,
      isInternal: false,
      attachmentId: null,
      position: index + 1,
      updatedAt: serverNowIso(),
    }));
    setFocusItems(items);
    void saveFocusItems(syncEngine, visit.routeId, visit.id, items);
  }, [focusItems.length, history.length, lastLog, openTasks, profile, setFocusItems, stations, suggested, syncEngine, visit]);

  // ── העלאת תמונות שממתינות, כשיש חיבור ──
  useEffect(() => {
    if (!visit || !profile || !navigator.onLine) return;
    void uploadPendingVisitPhotos(visit.id, profile.organizationId)
      .then((uploaded) => {
        if (Object.keys(uploaded).length === 0) return;
        setFocusItems(attachUploadedPhotos(focusItems, uploaded));
      })
      .catch(() => {
        /* נשאר מקומי; ננסה שוב בפתיחה הבאה */
      });
    // התלות במזהה הביקור: העלאה חוזרת נדרשת רק כשנפתח ביקור אחר.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, visit?.id]);

  const updateVisit = async (patch: Partial<RouteVisitRow>) => {
    if (!visit) return null;
    const updated = await patchVisit(syncEngine, visit, patch);
    apply((current) => ({
      ...current,
      visits: current.visits.map((item) => (item.id === updated.id ? updated : item)),
    }));
    return updated;
  };

  /**
   * מיקום נרשם רק אם המשתמש אישר גישה למיקום, ולעולם אינו מעכב את
   * העבודה: הסימון נשמר מיד, והמיקום מתווסף אחר כך אם התקבל. בלי
   * ההפרדה הזו, מכשיר שלא עונה על בקשת המיקום היה מקפיא את המסך.
   */
  const capturePositionInBackground = (updated: RouteVisitRow) => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void (async () => {
          const withLocation = await patchVisit(syncEngine, updated, {
            latitude: Number(position.coords.latitude.toFixed(6)),
            longitude: Number(position.coords.longitude.toFixed(6)),
          });
          apply((current) => ({
            ...current,
            visits: current.visits.map((item) => (item.id === withLocation.id ? withLocation : item)),
          }));
        })();
      },
      () => {
        /* המשתמש לא אישר מיקום — ממשיכים בלי לרשום אותו */
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const startVisit = async () => {
    if (!visit) return;
    setBusy(true);
    try {
      const now = serverNowIso();
      const updated = await updateVisit({
        status: 'in_progress',
        arrivalAt: visit.arrivalAt ?? now,
        startedAt: now,
      });
      showToast('הביקור התחיל. שעת ההגעה נרשמה.', 'success');
      if (updated) capturePositionInBackground(updated);
    } finally {
      setBusy(false);
    }
  };

  const openLog = async () => {
    if (!visit || !client) return;
    const logId = newUuid();
    await updateVisit({ linkedPestLogId: logId, status: visit.status === 'pending' ? 'in_progress' : visit.status });
    navigate(`/logs/${logId}?visit=${visit.id}&route=${visit.routeId}`);
  };

  const finishVisit = async () => {
    if (!visit) return;
    setBusy(true);
    try {
      const revisit = checklist.revisitNeeded;
      const updated = await updateVisit({
        status: revisit ? 'revisit_needed' : 'completed',
        completedAt: serverNowIso(),
        completionNotes: completionNotes.trim() || null,
        followUpRequired: checklist.followUpTask,
      });
      if (updated) capturePositionInBackground(updated);
      // ממתינים לשליחה לפני החזרה למסלול, כדי שהמסך הבא יציג את המצב
      // המעודכן. ללא קליטה הקריאה חוזרת מיד, והפעולה נשארת בתור.
      await syncEngine.flush();
      setFinishing(false);
      showToast(revisit ? 'הביקור נסגר וסומן כדורש ביקור חוזר' : 'הביקור הושלם', 'success');
      navigate(`/routes/${visit.routeId}`);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <SkeletonList rows={3} />;
  if (error || !bundle || !visit) {
    return (
      <>
        <PoisonNotice />
        <Alert kind="error" title="הביקור לא נמצא">
          {error ?? 'ייתכן שהביקור הוסר מהמסלול.'}
        </Alert>
        <button type="button" className="btn" onClick={() => navigate('/routes')}>
          חזרה למסלולים
        </button>
      </>
    );
  }

  const now = serverNow();
  const duration =
    visit.startedAt && visit.completedAt
      ? Math.round((new Date(visit.completedAt).getTime() - new Date(visit.startedAt).getTime()) / 60000)
      : null;
  const hints = buildPreviousTreatmentHints(lastLog?.snapshot ?? null);
  const nextDue =
    visit.frequencyDays && lastLog?.completedAt
      ? new Date(new Date(lastLog.completedAt).getTime() + visit.frequencyDays * 86_400_000).toISOString()
      : null;

  return (
    <>
      <PoisonNotice />

      {offline ? (
        <Alert kind="warning" title="עובדים ללא קליטה">
          הנתונים מוצגים מהעותק המקומי. כל סימון נשמר במכשיר ויסונכרן אוטומטית.
        </Alert>
      ) : null}

      <section className="card">
        <div className="route-header-top">
          <div>
            <h2>{client?.name ?? 'לקוח'}</h2>
            <p className="small muted">
              תחנה {visit.position} · {site?.label ?? 'ללא אתר מוגדר'}
            </p>
            <p className="small muted">{address ?? 'אין כתובת שמורה לאתר'}</p>
          </div>
          <StatusChip status={visit.status} tone={visitTone(visit, now)} alert={visitAlertLabel(visit, now)} />
        </div>

        <dl className="route-stats">
          <div>
            <dt>איש קשר</dt>
            <dd>{client?.contactRole ?? '—'}</dd>
          </div>
          <div>
            <dt>טלפון</dt>
            <dd>{client?.mobile ?? client?.phone ?? '—'}</dd>
          </div>
          <div>
            <dt>סוג השירות</dt>
            <dd>{visit.serviceType ?? '—'}</dd>
          </div>
          <div>
            <dt>טיפול אחרון</dt>
            <dd>{lastLog?.completedAt ? formatDateHe(lastLog.completedAt) : '—'}</dd>
          </div>
          <div>
            <dt>טיפול הבא</dt>
            <dd>{nextDue ? formatDateHe(nextDue) : '—'}</dd>
          </div>
        </dl>

        <ContactActions
          target={{
            latitude: point?.latitude ?? null,
            longitude: point?.longitude ?? null,
            address,
            phone: client?.phone ?? null,
            mobile: client?.mobile ?? null,
            clientName: client?.name ?? '',
          }}
        />

        {site?.siteDescription ? (
          <p className="small">
            <MapPin size={14} aria-hidden="true" /> הוראות הגעה: {site.siteDescription}
          </p>
        ) : null}

        {visit.internalNotes ? (
          <Alert kind="info" title="הערה פנימית לצוות">
            {visit.internalNotes} — אינה מוצגת ללקוח ואינה נכנסת ל-PDF של היומן.
          </Alert>
        ) : null}

        <div className="btn-row">
          {visit.status !== 'completed' ? (
            <button type="button" className="btn btn-primary" onClick={() => void startVisit()} disabled={busy}>
              <Play size={16} aria-hidden="true" /> {visit.startedAt ? 'עדכון שעת התחלה' : 'התחלת טיפול'}
            </button>
          ) : null}
          <button type="button" className="btn" onClick={() => void openLog()} disabled={busy || !client}>
            <FileText size={16} aria-hidden="true" /> פתיחת יומן הדברה
          </button>
          {visit.linkedPestLogId ? (
            <button type="button" className="btn btn-sm" onClick={() => navigate(`/logs/${visit.linkedPestLogId}`)}>
              פתיחת היומן המקושר
            </button>
          ) : null}
          {visit.status !== 'completed' ? (
            <button type="button" className="btn" onClick={() => setFinishing(true)} disabled={busy}>
              <Square size={16} aria-hidden="true" /> סיום ביקור
            </button>
          ) : null}
        </div>

        {visit.arrivalAt ? (
          <p className="small dim">
            הגעה: {formatDateTimeHe(visit.arrivalAt)}
            {visit.completedAt ? ` · סיום: ${formatDateTimeHe(visit.completedAt)}` : ''}
            {duration !== null ? ` · משך: ${duration} דק׳` : ''}
          </p>
        ) : null}
      </section>

      <FocusPanel visit={visit} items={focusItems} onChange={setFocusItems} />

      {finishing ? (
        <section className="card" aria-labelledby="finish-heading">
          <h2 id="finish-heading">סיום ביקור — רשימת בדיקה</h2>
          <p className="small muted">הסימון הוא של המדביר. המערכת אינה מסמנת דבר במקומו.</p>
          {VISIT_COMPLETION_CHECKLIST.map((item) => (
            <label className="check-row" key={item.key}>
              <input
                type="checkbox"
                checked={checklist[item.key]}
                onChange={(event) => setChecklist((current) => ({ ...current, [item.key]: event.target.checked }))}
              />
              <span>{item.label}</span>
            </label>
          ))}
          <div className="field">
            <label htmlFor="visit-notes">הערות סיום</label>
            <textarea
              id="visit-notes"
              rows={3}
              value={completionNotes}
              onChange={(event) => setCompletionNotes(event.target.value)}
            />
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => void finishVisit()} disabled={busy}>
              שמירת סיום הביקור
            </button>
            <button type="button" className="btn" onClick={() => setFinishing(false)}>
              ביטול
            </button>
          </div>
        </section>
      ) : null}

      <section className="card">
        <h3>היסטוריית טיפולים</h3>
        {history.length === 0 ? (
          <EmptyState>אין יומנים קודמים ללקוח זה.</EmptyState>
        ) : (
          <ul className="plain-list">
            {history.map((log) => (
              <li key={log.id}>
                <button type="button" className="link-button" onClick={() => navigate(`/logs/${log.id}`)}>
                  יומן מס׳ {log.serialNumber ?? '—'}
                  {log.completedAt ? ` · ${formatDateHe(log.completedAt)}` : ''}
                </button>
              </li>
            ))}
          </ul>
        )}
        {hints.length > 0 ? (
          <Alert kind="info" title="מידע מהטיפול הקודם">
            {hints.map((hint) => (
              <p className="small" key={hint.path}>
                {hint.label}: {hint.value}
              </p>
            ))}
            המידע מוצג לעיון בלבד. הוא אינו נכנס ליומן החדש אלא אם תזינו אותו שם במפורש.
          </Alert>
        ) : null}
      </section>

      <section className="card">
        <h3>תחנות האכלה וניטור במקום</h3>
        {stations.length === 0 ? (
          <EmptyState>לא נרשמו תחנות האכלה באתר זה.</EmptyState>
        ) : (
          <ul className="plain-list">
            {stations.map((station) => (
              <li key={station.id}>
                תחנה {station.stationNumber} · {station.locationDescription} · {station.status}
              </li>
            ))}
          </ul>
        )}
      </section>

      {openTasks.length > 0 ? (
        <section className="card">
          <h3>משימות פתוחות</h3>
          <ul className="plain-list">
            {openTasks.map((task) => (
              <li key={task.logId}>
                {task.description ?? 'טיפול משלים'}
                {task.targetDate ? ` · מועד יעד ${formatDateHe(task.targetDate)}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {visitHistory.length > 0 ? (
        <section className="card">
          <h3>היסטוריית הביקור</h3>
          <ul className="plain-list small">
            {visitHistory.map((entry) => (
              <li key={entry.id}>
                {formatDateTimeHe(entry.changedAt)} · {entry.action}
                {entry.fromStatus || entry.toStatus ? ` · ${entry.fromStatus ?? '—'} → ${entry.toStatus ?? '—'}` : ''}
                {entry.fromPosition !== null && entry.toPosition !== null
                  ? ` · מיקום ${entry.fromPosition} → ${entry.toPosition}`
                  : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
