import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/state/AppContext';
import { useToast } from '@/state/ToastContext';
import { Alert, EmptyState, PoisonNotice } from '@/components/Common';
import { SkeletonList } from '@/components/Skeleton';
import { listOrgMembers, listRoutes, loadRouteBundle, type OrgMember } from '@/lib/routes/repo';
import { patchVisit, saveRoute } from '@/lib/routes/actions';
import { isVisitLate, localDateIso, routeProgress } from '@/lib/routes/status';
import { ROUTE_STATUS_LABELS } from '@/schema/routes';
import type { RouteBundle } from '@/lib/routes/types';
import { formatDateHe, formatDateTimeHe, serverNow } from '@/lib/time';

/**
 * מסך ניהול למשרד.
 *
 * ההתקדמות מוצגת לפי מה שסונכרן מהשטח — ולכן מופיע כאן תמיד מתי עודכן
 * לאחרונה, ולא מוצגת התחייבות למעקב "בזמן אמת" שאינה קיימת.
 */
export function RouteAdminPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { profile, reference, syncEngine } = useApp();
  const { showToast } = useToast();
  const [date, setDate] = useState(localDateIso(serverNow()));
  const [bundles, setBundles] = useState<RouteBundle[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = profile?.role === 'owner' || profile?.role === 'manager';
  const now = serverNow();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const routes = (await listRoutes(date, date)).filter((route) => route.routeDate === date);
      const loaded = await Promise.all(routes.map((route) => loadRouteBundle(route.id)));
      setBundles(loaded);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'טעינת המסלולים נכשלה');
      setBundles([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
    void listOrgMembers()
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [load]);

  const clientsById = useMemo(
    () => new Map(reference.clients.map((client) => [client.id, client])),
    [reference.clients],
  );

  const reassignRoute = async (bundle: RouteBundle, profileId: string) => {
    const updated = { ...bundle.route, assignedUserId: profileId || null };
    await saveRoute(syncEngine, updated);
    setBundles((current) =>
      current.map((item) => (item.route.id === bundle.route.id ? { ...item, route: updated } : item)),
    );
    showToast('המסלול שויך מחדש', 'success');
  };

  const moveVisitToRoute = async (bundle: RouteBundle, visitId: string, targetRouteId: string) => {
    const visit = bundle.visits.find((item) => item.id === visitId);
    const target = bundles.find((item) => item.route.id === targetRouteId);
    if (!visit || !target) return;
    const updated = await patchVisit(syncEngine, visit, {
      routeId: targetRouteId,
      position: target.visits.length + 1,
      assignedUserId: target.route.assignedUserId,
    });
    setBundles((current) =>
      current.map((item) => {
        if (item.route.id === bundle.route.id) {
          return { ...item, visits: item.visits.filter((entry) => entry.id !== visitId) };
        }
        if (item.route.id === targetRouteId) return { ...item, visits: [...item.visits, updated] };
        return item;
      }),
    );
    showToast('התחנה הועברה לצוות אחר', 'success');
  };

  if (!isAdmin) {
    return (
      <>
        <PoisonNotice />
        <Alert kind="warning" title="אין הרשאה">
          מסך הניהול פתוח למנהלי העסק בלבד. עובד רואה ומעדכן רק את המסלולים שהוקצו לו.
        </Alert>
      </>
    );
  }

  return (
    <>
      <PoisonNotice />

      <section className="card">
        <h2>ניהול מסלולים</h2>
        <div className="field">
          <label htmlFor="admin-date">תאריך</label>
          <input id="admin-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
        <p className="small dim">
          ההתקדמות מתעדכנת עם כל סנכרון מהשטח. מסלול שעובד עובד עליו ללא קליטה יתעדכן כאן כשהחיבור יחזור.
        </p>
      </section>

      {loading ? <SkeletonList rows={3} /> : null}
      {error ? (
        <Alert kind="error" title="שגיאה">
          {error}
        </Alert>
      ) : null}

      {!loading && bundles.length === 0 ? <EmptyState>אין מסלולים בתאריך זה.</EmptyState> : null}

      {bundles.map((bundle) => {
        const progress = routeProgress(bundle.visits, now);
        return (
          <section className="card" key={bundle.route.id}>
            <div className="route-header-top">
              <div>
                <h3>{bundle.route.name}</h3>
                <p className="small muted">
                  {formatDateHe(bundle.route.routeDate)} · {ROUTE_STATUS_LABELS[bundle.route.status]} ·{' '}
                  {progress.completed}/{progress.total} הושלמו
                </p>
                <p className="small dim">עודכן לאחרונה: {formatDateTimeHe(bundle.route.updatedAt)}</p>
              </div>
              {progress.late > 0 ? <span className="tag tag-danger">{progress.late} ביקורים באיחור</span> : null}
            </div>

            <div className="progress-bar" role="img" aria-label={`${progress.completed} מתוך ${progress.total} תחנות הושלמו`}>
              <span style={{ width: `${progress.total === 0 ? 0 : (progress.completed / progress.total) * 100}%` }} />
            </div>

            <div className="field">
              <label htmlFor={`assign-${bundle.route.id}`}>שיוך עובד</label>
              <select
                id={`assign-${bundle.route.id}`}
                value={bundle.route.assignedUserId ?? ''}
                onChange={(event) => void reassignRoute(bundle, event.target.value)}
              >
                <option value="">ללא</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.fullName}
                  </option>
                ))}
              </select>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>לקוח</th>
                  <th>סטטוס</th>
                  <th>התחלה</th>
                  <th>סיום</th>
                  <th>יומן</th>
                  <th>העברה</th>
                </tr>
              </thead>
              <tbody>
                {[...bundle.visits]
                  .sort((a, b) => a.position - b.position)
                  .map((visit) => (
                    <tr key={visit.id} className={isVisitLate(visit, now) ? 'is-late' : undefined}>
                      <td>{visit.position}</td>
                      <td>{clientsById.get(visit.clientId)?.name ?? '—'}</td>
                      <td>{visit.status}</td>
                      <td>{visit.startedAt ? formatDateTimeHe(visit.startedAt) : '—'}</td>
                      <td>{visit.completedAt ? formatDateTimeHe(visit.completedAt) : '—'}</td>
                      <td>
                        {visit.linkedPestLogId ? (
                          <button type="button" className="link-button" onClick={() => navigate(`/logs/${visit.linkedPestLogId}`)}>
                            פתיחה
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <select
                          aria-label={`העברת ${clientsById.get(visit.clientId)?.name ?? 'התחנה'} למסלול אחר`}
                          value=""
                          onChange={(event) => void moveVisitToRoute(bundle, visit.id, event.target.value)}
                        >
                          <option value="">בחירת מסלול</option>
                          {bundles
                            .filter((item) => item.route.id !== bundle.route.id)
                            .map((item) => (
                              <option key={item.route.id} value={item.route.id}>
                                {item.route.name}
                              </option>
                            ))}
                        </select>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>

            <div className="btn-row btn-row-compact">
              <button type="button" className="btn btn-sm" onClick={() => navigate(`/routes/${bundle.route.id}`)}>
                פתיחת המסלול והוספת ביקור דחוף
              </button>
              <button type="button" className="btn btn-sm" onClick={() => navigate(`/routes/${bundle.route.id}/report`)}>
                דוח מסלול יומי
              </button>
            </div>
          </section>
        );
      })}
    </>
  );
}
