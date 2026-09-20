import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { useApp } from '@/state/AppContext';
import { Alert, PoisonNotice } from '@/components/Common';
import { SkeletonList } from '@/components/Skeleton';
import { useRouteBundle } from './useRouteBundle';
import { listOrgMembers, type OrgMember } from '@/lib/routes/repo';
import { formatDurationHe, routeProgress } from '@/lib/routes/status';
import { listVisitPhotos } from '@/lib/routes/photos';
import { ROUTE_KIND_LABELS, ROUTE_STATUS_LABELS, VISIT_STATUS_PRESENTATION } from '@/schema/routes';
import { formatDateHe, formatDateTimeHe, serverNow } from '@/lib/time';

/** דוח מסלול יומי — לתיעוד במשרד ולהדפסה. */
export function RouteReportPage(): React.JSX.Element {
  const { routeId } = useParams<{ routeId: string }>();
  const navigate = useNavigate();
  const { profile, reference } = useApp();
  const { bundle, loading, error } = useRouteBundle(routeId);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});

  const now = serverNow();
  const isAdmin = profile?.role === 'owner' || profile?.role === 'manager';

  useEffect(() => {
    void listOrgMembers()
      .then(setMembers)
      .catch(() => setMembers([]));
  }, []);

  useEffect(() => {
    if (!bundle) return;
    void (async () => {
      const counts: Record<string, number> = {};
      for (const visit of bundle.visits) {
        counts[visit.id] = (await listVisitPhotos(visit.id)).length;
      }
      setPhotoCounts(counts);
    })();
  }, [bundle]);

  const clientsById = useMemo(
    () => new Map(reference.clients.map((client) => [client.id, client])),
    [reference.clients],
  );

  if (loading) return <SkeletonList rows={3} />;
  if (error || !bundle) {
    return (
      <Alert kind="error" title="לא ניתן להפיק את הדוח">
        {error ?? 'המסלול לא נמצא.'}
      </Alert>
    );
  }

  const { route } = bundle;
  const visits = [...bundle.visits].sort((a, b) => a.position - b.position);
  const progress = routeProgress(visits, now);
  const assignee = members.find((member) => member.id === route.assignedUserId);
  const totalDuration = visits.reduce((sum, visit) => {
    if (!visit.startedAt || !visit.completedAt) return sum;
    return sum + Math.round((new Date(visit.completedAt).getTime() - new Date(visit.startedAt).getTime()) / 60000);
  }, 0);

  return (
    <div className="route-report">
      <PoisonNotice />

      <section className="card">
        <div className="route-header-top">
          <div>
            <h2>דוח מסלול — {route.name}</h2>
            <p className="small muted">
              {formatDateHe(route.routeDate)} · {ROUTE_KIND_LABELS[route.routeKind]} ·{' '}
              {ROUTE_STATUS_LABELS[route.status]}
            </p>
            <p className="small muted">
              עובד: {assignee?.fullName ?? route.teamName ?? '—'}
              {route.vehicle ? ` · רכב: ${route.vehicle}` : ''}
            </p>
            <p className="small muted">
              התחלה: {route.startedAt ? formatDateTimeHe(route.startedAt) : '—'} · סיום:{' '}
              {route.completedAt ? formatDateTimeHe(route.completedAt) : '—'}
            </p>
          </div>
          <button type="button" className="btn btn-sm no-print" onClick={() => globalThis.print()}>
            <Printer size={16} aria-hidden="true" /> הדפסה
          </button>
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
            <dt>לא בוצעו</dt>
            <dd>{progress.total - progress.completed}</dd>
          </div>
          <div>
            <dt>זמן טיפול מצטבר</dt>
            <dd>{formatDurationHe(totalDuration)}</dd>
          </div>
        </dl>
      </section>

      <section className="card">
        <h3>התחנות לפי הסדר</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>לקוח</th>
              <th>סטטוס</th>
              <th>הגעה</th>
              <th>סיום</th>
              <th>משך</th>
              <th>יומן מקושר</th>
              <th>הערות / סיבה</th>
              <th>תמונות</th>
            </tr>
          </thead>
          <tbody>
            {visits.map((visit) => {
              const duration =
                visit.startedAt && visit.completedAt
                  ? Math.round(
                      (new Date(visit.completedAt).getTime() - new Date(visit.startedAt).getTime()) / 60000,
                    )
                  : null;
              return (
                <tr key={visit.id}>
                  <td>{visit.position}</td>
                  <td>{clientsById.get(visit.clientId)?.name ?? '—'}</td>
                  <td>{VISIT_STATUS_PRESENTATION[visit.status].label}</td>
                  <td>{visit.arrivalAt ? formatDateTimeHe(visit.arrivalAt) : '—'}</td>
                  <td>{visit.completedAt ? formatDateTimeHe(visit.completedAt) : '—'}</td>
                  <td>{duration === null ? '—' : `${duration} דק׳`}</td>
                  <td>
                    {visit.linkedPestLogId ? (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => navigate(`/logs/${visit.linkedPestLogId}`)}
                      >
                        פתיחה
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{visit.completionNotes ?? visit.postponeReason ?? '—'}</td>
                  <td>{isAdmin ? (photoCounts[visit.id] ?? 0) : 'לפי הרשאה'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3>משימות המשך</h3>
        {visits.filter((visit) => visit.followUpRequired || visit.status === 'revisit_needed').length === 0 ? (
          <p className="muted small">לא נדרשו משימות המשך במסלול הזה.</p>
        ) : (
          <ul className="plain-list">
            {visits
              .filter((visit) => visit.followUpRequired || visit.status === 'revisit_needed')
              .map((visit) => (
                <li key={visit.id}>
                  {clientsById.get(visit.clientId)?.name ?? '—'} — {visit.completionNotes ?? 'נדרשת המשך טיפול'}
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h3>חתימת העובד</h3>
        <p className="small muted">
          חתימה על דוח המסלול אינה חלק מיומן ההדברה הרשמי. חתימות הלקוח והמדביר על הטיפול עצמו נמצאות
          ביומן המקושר.
        </p>
        <div className="signature-line" aria-hidden="true" />
      </section>
    </div>
  );
}
