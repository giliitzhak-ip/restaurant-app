import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '@/state/AppContext';
import { Alert, EmptyState, PoisonNotice } from '@/components/Common';
import { SkeletonList } from '@/components/Skeleton';
import { useRouteBundle } from './useRouteBundle';
import { siteAddressText, siteCoordinates } from '@/lib/routes/prefill';
import { nextVisit, visitTone } from '@/lib/routes/status';
import { serverNow } from '@/lib/time';

/**
 * מפת המסלול.
 *
 * אין כאן מפת רחובות: בלי מפתח לשירות מפות אי אפשר להציג מפה אמיתית,
 * ולכן מוצג תרשים יחסי של נקודות הציון לפי הסדר — וכתוב במפורש שזה
 * תרשים ולא מפה. הניווט עצמו נפתח באפליקציית מפות אמיתית.
 */
export function RouteMapPage(): React.JSX.Element {
  const { routeId } = useParams<{ routeId: string }>();
  const navigate = useNavigate();
  const { reference } = useApp();
  const { bundle, loading, error } = useRouteBundle(routeId);

  const now = serverNow();
  const sitesById = useMemo(() => new Map(reference.sites.map((site) => [site.id, site])), [reference.sites]);
  const clientsById = useMemo(
    () => new Map(reference.clients.map((client) => [client.id, client])),
    [reference.clients],
  );

  const points = useMemo(() => {
    const visits = [...(bundle?.visits ?? [])].sort((a, b) => a.position - b.position);
    return visits.map((visit) => {
      const site = visit.clientSiteId ? sitesById.get(visit.clientSiteId) : null;
      const point =
        typeof visit.latitude === 'number' && typeof visit.longitude === 'number'
          ? { latitude: visit.latitude, longitude: visit.longitude }
          : siteCoordinates(site);
      return {
        visit,
        point,
        label: clientsById.get(visit.clientId)?.name ?? 'לקוח',
        address: siteAddressText(site, clientsById.get(visit.clientId)?.address ?? null),
      };
    });
  }, [bundle, clientsById, sitesById]);

  const mapped = points.filter((entry) => entry.point !== null);
  const upcoming = nextVisit(bundle?.visits ?? []);

  /** קישור אחד שפותח את כל התחנות לפי הסדר ב-Google Maps. */
  const multiStopLink = useMemo(() => {
    const coords = mapped.map((entry) => `${entry.point?.latitude},${entry.point?.longitude}`);
    if (coords.length === 0) return null;
    const destination = coords[coords.length - 1];
    const waypoints = coords.slice(0, -1);
    const origin = bundle?.route.startPointCoordinates
      ? `${bundle.route.startPointCoordinates.latitude},${bundle.route.startPointCoordinates.longitude}`
      : waypoints.shift();
    const params = new URLSearchParams({ api: '1', destination: destination ?? '', travelmode: 'driving' });
    if (origin) params.set('origin', origin);
    if (waypoints.length > 0) params.set('waypoints', waypoints.join('|'));
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }, [bundle?.route.startPointCoordinates, mapped]);

  if (loading) return <SkeletonList rows={2} />;
  if (error || !bundle) {
    return (
      <Alert kind="error" title="לא ניתן להציג את המפה">
        {error ?? 'המסלול לא נמצא.'}
      </Alert>
    );
  }

  const latitudes = mapped.map((entry) => entry.point?.latitude ?? 0);
  const longitudes = mapped.map((entry) => entry.point?.longitude ?? 0);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);
  const spanLat = Math.max(maxLat - minLat, 0.001);
  const spanLon = Math.max(maxLon - minLon, 0.001);

  const project = (latitude: number, longitude: number) => ({
    // ציר ה-X הפוך: מסך RTL, מזרח בימין.
    x: 90 - ((longitude - minLon) / spanLon) * 80,
    y: 90 - ((latitude - minLat) / spanLat) * 80,
  });

  return (
    <>
      <PoisonNotice />

      <Alert kind="info" title="תרשים ולא מפה">
        למערכת אין חיבור לשירות מפות, ולכן מוצג תרשים יחסי של נקודות הציון לפי סדר הביקור. הניווט בפועל
        נפתח ב-Waze או ב-Google Maps, שם מוצגת המפה האמיתית ונתוני התנועה.
      </Alert>

      {mapped.length === 0 ? (
        <EmptyState>לאף תחנה במסלול אין נקודת ציון, ולכן אין מה לשרטט.</EmptyState>
      ) : (
        <section className="card">
          <svg viewBox="0 0 100 100" className="route-map" role="img" aria-label="תרשים סדר התחנות במסלול">
            <polyline
              fill="none"
              stroke="var(--brand)"
              strokeWidth="0.6"
              strokeDasharray="2 1.5"
              points={mapped
                .map((entry) => {
                  const { x, y } = project(entry.point?.latitude ?? 0, entry.point?.longitude ?? 0);
                  return `${x},${y}`;
                })
                .join(' ')}
            />
            {mapped.map((entry, index) => {
              const { x, y } = project(entry.point?.latitude ?? 0, entry.point?.longitude ?? 0);
              const tone = visitTone(entry.visit, now);
              return (
                <g key={entry.visit.id}>
                  <circle
                    cx={x}
                    cy={y}
                    r={upcoming?.id === entry.visit.id ? 4 : 3}
                    className={`map-pin tone-${tone}`}
                  />
                  <text x={x} y={y + 1.2} textAnchor="middle" className="map-pin-label">
                    {index + 1}
                  </text>
                </g>
              );
            })}
          </svg>

          {multiStopLink ? (
            <a className="btn btn-primary" href={multiStopLink} target="_blank" rel="noreferrer">
              פתיחת כל התחנות ב-Google Maps
            </a>
          ) : null}
        </section>
      )}

      <section className="card">
        <h3>התחנות לפי הסדר</h3>
        <ol className="plain-list">
          {points.map((entry, index) => (
            <li key={entry.visit.id}>
              {index + 1}. {entry.label} — {entry.address ?? 'אין כתובת'}
              {entry.point ? '' : ' (ללא נקודת ציון)'}
              {upcoming?.id === entry.visit.id ? ' · התחנה הבאה' : ''}
              {entry.visit.status === 'completed' ? ' · הושלם' : ''}
            </li>
          ))}
        </ol>
        <button type="button" className="btn" onClick={() => navigate(`/routes/${bundle.route.id}`)}>
          חזרה למסלול
        </button>
      </section>
    </>
  );
}
