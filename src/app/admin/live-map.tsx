'use client';

import { Badge, Card } from '@/components/ui';

interface Job {
  id: string; status: string; lat: number; lon: number;
  category_name: string | null; raw_description: string;
}
interface Provider {
  id: string; full_name: string; state: string; lat: number; lon: number;
  heading_deg: string | null; age_seconds: string; category_name: string | null;
}

/**
 * Live operations map (spec §33).
 *
 * A dependency-free SVG projection rather than a map tile vendor: it needs no
 * API key, works offline, and shows exactly what matters operationally —
 * where supply is, where demand is, and which way supply is pointing.
 *
 * Stated plainly (docs/ASSUMPTIONS.md A-006): this is a relative-position
 * plot, not a street map. It is for spotting imbalance, not navigation.
 */
export function LiveMap({ jobs, providers }: { jobs: Job[]; providers: Provider[] }) {
  const points = [
    ...providers.map((p) => ({ lat: p.lat, lon: p.lon })),
    ...jobs.map((j) => ({ lat: j.lat, lon: j.lon })),
  ].filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));

  if (points.length === 0) {
    return (
      <Card>
        <h2 className="text-sm font-semibold text-slate-300">מפה חיה</h2>
        <p className="mt-3 text-sm text-slate-500">
          אין מקצוענים מחוברים או עבודות פעילות להצגה.
        </p>
      </Card>
    );
  }

  // Bounding box with a small margin, so a single point does not divide by zero.
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const padLat = Math.max((maxLat - minLat) * 0.12, 0.004);
  const padLon = Math.max((maxLon - minLon) * 0.12, 0.004);

  const W = 800;
  const H = 420;
  const x = (lon: number) =>
    ((lon - (minLon - padLon)) / (maxLon - minLon + 2 * padLon)) * W;
  // Latitude increases northwards, SVG y increases downwards.
  const y = (lat: number) =>
    H - ((lat - (minLat - padLat)) / (maxLat - minLat + 2 * padLat)) * H;

  const STALE_AFTER_SECONDS = 120;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-300">מפה חיה</h2>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge tone="success">מקצוען פנוי</Badge>
          <Badge tone="accent">מקצוען בעבודה</Badge>
          <Badge tone="warning">עבודה בחיפוש</Badge>
          <Badge tone="danger">מיקום לא עדכני</Badge>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-navy-700 bg-navy-950">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={`מפת מצב: ${providers.length} מקצוענים ו-${jobs.length} עבודות פעילות`}
        >
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e2b47" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#grid)" />

          {/* Jobs: squares, so shape alone distinguishes them from providers
              without relying on colour (spec §41). */}
          {jobs.map((job) => {
            const searching = job.status === 'SEARCHING' || job.status === 'OFFERS_AVAILABLE';
            return (
              <g key={job.id}>
                {searching && (
                  <circle
                    cx={x(job.lon)}
                    cy={y(job.lat)}
                    r="16"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    opacity="0.5"
                  />
                )}
                <rect
                  x={x(job.lon) - 5}
                  y={y(job.lat) - 5}
                  width="10"
                  height="10"
                  fill={searching ? '#f59e0b' : '#38bdf8'}
                />
                <title>{`${job.category_name ?? 'עבודה'} — ${job.status}`}</title>
              </g>
            );
          })}

          {/* Providers: circles, with a heading ray when direction is known. */}
          {providers.map((provider) => {
            const stale = Number(provider.age_seconds) > STALE_AFTER_SECONDS;
            const colour = stale ? '#f87171' : provider.state === 'BUSY' ? '#38bdf8' : '#34d399';
            const cx = x(provider.lon);
            const cy = y(provider.lat);
            const heading = provider.heading_deg === null ? null : Number(provider.heading_deg);

            // Bearing is clockwise from north; SVG angles run from +x axis.
            const rad = heading === null ? null : ((heading - 90) * Math.PI) / 180;

            return (
              <g key={provider.id}>
                {rad !== null && (
                  <line
                    x1={cx}
                    y1={cy}
                    x2={cx + Math.cos(rad) * 18}
                    y2={cy + Math.sin(rad) * 18}
                    stroke={colour}
                    strokeWidth="2"
                    opacity="0.85"
                  />
                )}
                <circle cx={cx} cy={cy} r="6" fill={colour} />
                <title>
                  {`${provider.full_name} — ${provider.state}` +
                    (heading === null ? ' (אין כיוון)' : ` (כיוון ${Math.round(heading)}°)`) +
                    (stale ? ` — מיקום לפני ${provider.age_seconds} שניות` : '')}
                </title>
              </g>
            );
          })}
        </svg>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        תרשים מצב יחסי (לא מפת רחובות). קו מציין כיוון נסיעה; מקצוען ללא קו לא
        מדווח כיוון. אדום = מיקום לא עדכני ולכן לא ישובץ.
      </p>
    </Card>
  );
}
