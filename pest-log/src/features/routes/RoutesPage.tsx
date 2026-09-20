import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Download, Plus, Route as RouteIcon } from 'lucide-react';
import { useApp } from '@/state/AppContext';
import { useToast } from '@/state/ToastContext';
import { Alert, EmptyState, PoisonNotice } from '@/components/Common';
import { SkeletonList } from '@/components/Skeleton';
import { cachedRoutes, listRoutes, loadRouteBundle, listOrgMembers, type OrgMember } from '@/lib/routes/repo';
import { saveRoute } from '@/lib/routes/actions';
import { localDateIso } from '@/lib/routes/status';
import { ROUTE_KINDS, ROUTE_KIND_LABELS, ROUTE_STATUS_LABELS, routeFormSchema, type RouteKind } from '@/schema/routes';
import type { RouteRow } from '@/lib/routes/types';
import { newUuid } from '@/lib/ids';
import { formatDateHe, serverNow, serverNowIso } from '@/lib/time';

/**
 * רשימת מסלולי העבודה: של היום, הקרובים ואלה שהיו.
 * מנהל יכול ליצור מסלול חדש; עובד רואה רק את המסלולים שהוקצו לו —
 * האכיפה היא ב-RLS ולא רק במסך.
 */
export function RoutesPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { profile, syncEngine } = useApp();
  const { showToast } = useToast();
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [creating, setCreating] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const today = localDateIso(serverNow());
  const isAdmin = profile?.role === 'owner' || profile?.role === 'manager';

  const [form, setForm] = useState({
    name: '',
    routeKind: 'daily' as RouteKind,
    areaName: '',
    routeDate: today,
    startTime: '',
    assignedUserId: '',
    teamName: '',
    vehicle: '',
    startPointAddress: '',
    notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRoutes(await listRoutes());
      setOffline(false);
    } catch {
      setRoutes(await cachedRoutes());
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void listOrgMembers()
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [load]);

  const todayRoutes = useMemo(() => routes.filter((route) => route.routeDate === today), [routes, today]);
  const upcoming = useMemo(() => routes.filter((route) => route.routeDate > today), [routes, today]);
  const past = useMemo(() => routes.filter((route) => route.routeDate < today), [routes, today]);

  const createRoute = async () => {
    if (!profile) return;
    const parsed = routeFormSchema.safeParse({
      ...form,
      assignedUserId: form.assignedUserId || undefined,
      startTime: form.startTime || undefined,
    });
    if (!parsed.success) {
      setProblems(parsed.error.issues.map((issue) => issue.message));
      return;
    }
    setProblems([]);
    setBusy(true);
    try {
      const route: RouteRow = {
        id: newUuid(),
        organizationId: profile.organizationId,
        templateId: null,
        name: parsed.data.name,
        routeKind: parsed.data.routeKind,
        areaName: parsed.data.areaName || null,
        routeDate: parsed.data.routeDate,
        startTime: parsed.data.startTime ?? null,
        assignedUserId: parsed.data.assignedUserId ?? null,
        teamName: parsed.data.teamName || null,
        vehicle: parsed.data.vehicle || null,
        startPointAddress: parsed.data.startPointAddress || null,
        startPointCoordinates: null,
        notes: parsed.data.notes || null,
        status: 'planned',
        orderLocked: false,
        startedAt: null,
        completedAt: null,
        updatedAt: serverNowIso(),
      };
      await saveRoute(syncEngine, route);
      setRoutes((current) => [route, ...current]);
      setCreating(false);
      showToast('המסלול נוצר', 'success');
      navigate(`/routes/${route.id}`);
    } finally {
      setBusy(false);
    }
  };

  const downloadForOffline = async (route: RouteRow) => {
    try {
      await loadRouteBundle(route.id);
      showToast('המסלול נשמר במכשיר לעבודה ללא קליטה', 'success');
    } catch {
      showToast('ההורדה נכשלה — נדרש חיבור', 'error');
    }
  };

  const renderRoute = (route: RouteRow) => (
    <article className="card route-card" key={route.id} data-testid={`route-${route.id}`}>
      <div className="route-header-top">
        <div>
          <h3>{route.name}</h3>
          <p className="small muted">
            {formatDateHe(route.routeDate)} · {ROUTE_KIND_LABELS[route.routeKind]}
            {route.startTime ? ` · יציאה ${route.startTime}` : ''}
          </p>
          <p className="small dim">
            {members.find((member) => member.id === route.assignedUserId)?.fullName ??
              route.teamName ??
              'ללא שיוך'}
            {route.vehicle ? ` · ${route.vehicle}` : ''}
          </p>
        </div>
        <span className={`tag ${route.status === 'active' ? 'tag-brand' : ''}`}>
          {ROUTE_STATUS_LABELS[route.status]}
        </span>
      </div>
      <div className="btn-row btn-row-compact">
        <button type="button" className="btn btn-sm btn-primary" onClick={() => navigate(`/routes/${route.id}`)}>
          פתיחת המסלול
        </button>
        <button type="button" className="btn btn-sm" onClick={() => void downloadForOffline(route)}>
          <Download size={16} aria-hidden="true" /> הורדה לעבודה ללא קליטה
        </button>
        <button type="button" className="btn btn-sm" onClick={() => navigate(`/routes/${route.id}/report`)}>
          דוח
        </button>
      </div>
    </article>
  );

  if (loading) return <SkeletonList rows={3} />;

  return (
    <>
      <PoisonNotice />

      {offline ? (
        <Alert kind="warning" title="עובדים ללא קליטה">
          מוצגים המסלולים שנשמרו במכשיר.
        </Alert>
      ) : null}

      <div className="btn-row">
        <button type="button" className="btn" onClick={() => navigate('/routes/templates')}>
          <RouteIcon size={16} aria-hidden="true" /> קווי אחזקה קבועים
        </button>
        {isAdmin ? (
          <>
            <button type="button" className="btn" onClick={() => navigate('/routes/admin')}>
              <CalendarDays size={16} aria-hidden="true" /> מסך ניהול למשרד
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setCreating((value) => !value)}>
              <Plus size={16} aria-hidden="true" /> מסלול חדש
            </button>
          </>
        ) : null}
      </div>

      {creating ? (
        <section className="card">
          <h2>מסלול חדש</h2>
          {problems.length > 0 ? (
            <Alert kind="error" title="לא ניתן ליצור את המסלול">
              <ul>
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </Alert>
          ) : null}
          <div className="field">
            <label htmlFor="route-name">שם המסלול</label>
            <input id="route-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="route-kind">סוג המסלול</label>
            <select
              id="route-kind"
              value={form.routeKind}
              onChange={(event) => setForm({ ...form, routeKind: event.target.value as RouteKind })}
            >
              {ROUTE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {ROUTE_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="route-area">אזור</label>
            <input
              id="route-area"
              value={form.areaName}
              onChange={(event) => setForm({ ...form, areaName: event.target.value })}
              placeholder="לדוגמה: ירושלים, בית שמש, מודיעין, רמלה"
            />
          </div>
          <div className="field">
            <label htmlFor="route-date">תאריך</label>
            <input
              id="route-date"
              type="date"
              value={form.routeDate}
              onChange={(event) => setForm({ ...form, routeDate: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="route-start">שעת התחלה</label>
            <input
              id="route-start"
              type="time"
              value={form.startTime}
              onChange={(event) => setForm({ ...form, startTime: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="route-assignee">עובד אחראי</label>
            <select
              id="route-assignee"
              value={form.assignedUserId}
              onChange={(event) => setForm({ ...form, assignedUserId: event.target.value })}
            >
              <option value="">ללא</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.fullName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="route-team">צוות</label>
            <input id="route-team" value={form.teamName} onChange={(event) => setForm({ ...form, teamName: event.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="route-vehicle">רכב</label>
            <input id="route-vehicle" value={form.vehicle} onChange={(event) => setForm({ ...form, vehicle: event.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="route-origin">נקודת יציאה</label>
            <input
              id="route-origin"
              value={form.startPointAddress}
              onChange={(event) => setForm({ ...form, startPointAddress: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="route-notes">הערות כלליות</label>
            <textarea id="route-notes" rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => void createRoute()} disabled={busy}>
              יצירת המסלול
            </button>
            <button type="button" className="btn" onClick={() => setCreating(false)}>
              ביטול
            </button>
          </div>
        </section>
      ) : null}

      <h2>המסלול של היום</h2>
      {todayRoutes.length === 0 ? <EmptyState>אין מסלול מתוכנן להיום.</EmptyState> : todayRoutes.map(renderRoute)}

      {upcoming.length > 0 ? (
        <>
          <h2>מסלולים קרובים</h2>
          {upcoming.map(renderRoute)}
        </>
      ) : null}

      {past.length > 0 ? (
        <>
          <h2>מסלולים קודמים</h2>
          {past.slice(0, 10).map(renderRoute)}
        </>
      ) : null}
    </>
  );
}
