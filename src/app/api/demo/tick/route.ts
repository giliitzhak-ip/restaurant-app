import { z } from 'zod';
import { ApiError, handleError, ok, parseJson } from '@/lib/api';
import { withSystem } from '@/lib/db';
import { expireAndEscalate } from '@/domains/matching/dispatch';
import { logOperation, newRequestId } from '@/lib/logger';

// No .default({}) on the object: in Zod 4 that requires the full output
// type. A missing body is handled at the call site instead.
const bodySchema = z
  .object({
    /** Metres to advance each demo provider along its heading. */
    advanceMeters: z.number().min(0).max(5000).default(120),
    /** Refresh recorded_at so demo providers count as live. */
    refreshLocations: z.boolean().default(true),
    /** Also expire stale offers and escalate waiting jobs. */
    runMaintenance: z.boolean().default(false),
  });

/**
 * DEMO MODE simulator tick (spec §59).
 *
 * Only available when DEMO_MODE=true, and it only ever touches rows tagged
 * `is_demo = true` — demo data cannot mix with production data.
 *
 * Why this exists: provider location fixes go stale after
 * matching.thresholds.maxLocationAgeSeconds (120s), and the matcher
 * deliberately refuses to treat a stale fix as live (spec §18). That is
 * correct behaviour, and it means static seed data stops being matchable two
 * minutes after seeding. Rather than weaken the staleness rule for
 * convenience, the demo simulates what a real fleet does: it keeps moving and
 * keeps reporting.
 *
 * Each tick advances every demo provider along its own heading and refreshes
 * the timestamp, so the demo shows a live network instead of a frozen one.
 */
export async function POST(request: Request) {
  const requestId = newRequestId();

  try {
    if (process.env.DEMO_MODE !== 'true') {
      throw new ApiError('DEMO_MODE_DISABLED', 'סימולטור ההדגמה כבוי', 403);
    }

    const body = await parseJson(request, bodySchema).catch(() => ({
      advanceMeters: 120,
      refreshLocations: true,
      runMaintenance: false,
    }));

    const result = await withSystem(async (db) => {
      // Advance along the heading. 1 degree of latitude is ~111.32 km;
      // longitude is scaled by cos(latitude).
      const moved = await db.many<{ provider_id: string }>(
        `update provider_locations pl
            set location = st_point(
                  st_x(pl.location::geometry)
                    + ($1 / (111320.0 * cos(radians(st_y(pl.location::geometry)))))
                      * sin(radians(coalesce(pl.heading_deg, 0))),
                  st_y(pl.location::geometry)
                    + ($1 / 111320.0) * cos(radians(coalesce(pl.heading_deg, 0)))
                )::geography,
                recorded_at = case when $2 then now() else pl.recorded_at end,
                speed_kmh = case when pl.heading_deg is null then pl.speed_kmh else 34 end
          from provider_profiles pp
         where pp.id = pl.provider_id
           and pp.is_demo = true
           and pp.state <> 'OFFLINE'
         returning pl.provider_id`,
        [body.advanceMeters, body.refreshLocations],
      );

      // Append to history only for providers actually working a job, matching
      // production behaviour (spec §17).
      await db.query(
        `insert into provider_location_history
           (provider_id, job_id, location, heading_deg, speed_kmh, accuracy_m)
         select pl.provider_id, a.job_id, pl.location, pl.heading_deg, pl.speed_kmh, pl.accuracy_m
           from provider_locations pl
           join provider_profiles pp on pp.id = pl.provider_id and pp.is_demo
           join job_assignments a on a.provider_id = pl.provider_id
           join jobs j on j.id = a.job_id
          where j.status in ('EN_ROUTE','ARRIVED','IN_PROGRESS')`,
      );

      return { moved: moved.length };
    });

    const maintenance = body.runMaintenance ? await expireAndEscalate() : null;

    logOperation({
      requestId,
      operation: 'demo.tick',
      result: 'ok',
      meta: {
        moved: result.moved,
        advanceMeters: body.advanceMeters,
        expiredOffers: maintenance?.expiredOffers ?? 0,
      },
    });

    return ok({
      providersMoved: result.moved,
      advanceMeters: body.advanceMeters,
      locationsRefreshed: body.refreshLocations,
      maintenance,
    });
  } catch (error) {
    return handleError(error, 'demo.tick', requestId);
  }
}
