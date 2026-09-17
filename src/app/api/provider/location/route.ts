import { z } from 'zod';
import { ApiError, handleError, ok, parseJson } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { withUser } from '@/lib/db';
import { loadLocationIntervals } from '@/lib/settings';
import { newRequestId } from '@/lib/logger';

const bodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  headingDeg: z.number().min(0).max(360).nullable().optional(),
  speedKmh: z.number().min(0).max(400).nullable().optional(),
  accuracyM: z.number().nonnegative().max(100_000).nullable().optional(),
});

/**
 * Provider location report (spec §18).
 *
 * The provider writes only their OWN row — enforced by RLS, not by this
 * handler. Reporting while OFFLINE is refused: no tracking means no stored
 * position.
 *
 * `recorded_at` is set by the server, never by the client, so a client cannot
 * make a stale fix look fresh and defeat the staleness filter.
 */
export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const user = await requireRole('provider');
    const body = await parseJson(request, bodySchema);

    // A 360 reading means the same direction as 0; the column requires < 360.
    const heading =
      body.headingDeg === null || body.headingDeg === undefined
        ? null
        : body.headingDeg % 360;

    const result = await withUser(user.id, async (db) => {
      const profile = await db.one<{ state: string }>(
        `select state::text as state from provider_profiles where id = $1`,
        [user.id],
      );
      if (!profile) return { rejected: 'NOT_FOUND' as const };
      if (profile.state === 'OFFLINE') return { rejected: 'OFFLINE' as const };

      await db.query(
        `insert into provider_locations
           (provider_id, location, heading_deg, speed_kmh, accuracy_m, recorded_at)
         values ($1, st_point($3,$2)::geography, $4, $5, $6, now())
         on conflict (provider_id) do update set
           location = excluded.location,
           heading_deg = excluded.heading_deg,
           speed_kmh = excluded.speed_kmh,
           accuracy_m = excluded.accuracy_m,
           recorded_at = now()`,
        [user.id, body.lat, body.lon, heading, body.speedKmh ?? null, body.accuracyM ?? null],
      );

      // Append to history only while working a job, so idle providers are not
      // trailed any more than operationally necessary (spec §17, §18).
      const activeJob = await db.one<{ job_id: string }>(
        `select a.job_id
           from job_assignments a
           join jobs j on j.id = a.job_id
          where a.provider_id = $1
            and j.status in ('EN_ROUTE','ARRIVED','IN_PROGRESS')
          limit 1`,
        [user.id],
      );

      if (activeJob) {
        await db.query(
          `insert into provider_location_history
             (provider_id, job_id, location, heading_deg, speed_kmh, accuracy_m)
           values ($1,$2, st_point($4,$3)::geography, $5,$6,$7)`,
          [
            user.id, activeJob.job_id, body.lat, body.lon,
            heading, body.speedKmh ?? null, body.accuracyM ?? null,
          ],
        );
      }

      return { state: profile.state, jobId: activeJob?.job_id ?? null };
    });

    if ('rejected' in result) {
      if (result.rejected === 'NOT_FOUND') {
        throw new ApiError('NOT_FOUND', 'הפרופיל לא נמצא', 404);
      }
      throw new ApiError(
        'PROVIDER_OFFLINE',
        'לא נשמר מיקום: המצב שלך הוא לא מקוון',
        409,
      );
    }

    const intervals = await loadLocationIntervals();
    const nextInterval = result.jobId ? intervals.EN_ROUTE : intervals[result.state as 'ONLINE' | 'BUSY'];

    return ok({ ok: true, nextIntervalSeconds: nextInterval });
  } catch (error) {
    return handleError(error, 'provider.location', requestId);
  }
}
