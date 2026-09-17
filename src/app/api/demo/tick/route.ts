import { z } from 'zod';
import { ApiError, handleError, ok, parseJson } from '@/lib/api';
import { withSystem, withUser } from '@/lib/db';
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
    /**
     * Accept pending offers held by SYNTHETIC providers, so a demo request
     * reaches a match instead of waiting for a provider who has no login.
     *
     * Off by default: a tick must never silently assign someone's work.
     */
    autoAcceptSynthetic: z.boolean().default(false),
    /** Ceiling on acceptances per tick, so one call cannot drain the board. */
    maxAccepts: z.number().int().min(1).max(50).default(10),
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
      autoAcceptSynthetic: false,
      maxAccepts: 10,
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

    /* ── Let the synthetic network answer ──────────────────────────────────
       The 1000-provider network is DATA, not accounts: it has no passwords,
       so nobody can accept on its behalf through the UI. Since its members
       usually outrank the 22 hand-built demo logins, a demo request would
       collect offers and never reach a match.

       Acceptance goes through accept_job_offer() as the provider, exactly as
       the real endpoint does — the SELECT … FOR UPDATE, the single-winner
       rule, the state machine and the audit trail all apply. Nothing is
       written directly, so this cannot produce an assignment the real flow
       could not have produced. It is reachable only with DEMO_MODE=true and
       only for @synthetic.local providers. */
    const accepted: { jobId: string; providerId: string }[] = [];
    const skipped: string[] = [];

    if (body.autoAcceptSynthetic) {
      const candidates = await withSystem((db) =>
        db.many<{ offer_id: string; job_id: string; provider_id: string }>(
          `select distinct on (o.job_id)
                  o.id as offer_id, o.job_id, o.provider_id
             from job_offers o
             join jobs j on j.id = o.job_id
             join profiles customer on customer.id = j.customer_id
             join profiles p on p.id = o.provider_id
            where o.status = 'PENDING'
              and o.expires_at > now()
              and j.status in ('SEARCHING','OFFERS_AVAILABLE')
              -- The CUSTOMER's flag, not the job's: a request typed into the
              -- UI during a demo has no is_demo of its own, and those are
              -- precisely the requests this exists to answer. Keying on the
              -- customer keeps the separation that matters — a real
              -- customer's job can never be auto-accepted.
              and customer.is_demo = true
              and p.is_demo = true
              and p.email like '%@synthetic.local'
              and not exists (select 1 from job_assignments a where a.job_id = o.job_id)
            order by o.job_id, o.final_score desc nulls last
            limit $1`,
          [body.maxAccepts],
        ),
      );

      for (const candidate of candidates) {
        try {
          await withUser(
            candidate.provider_id,
            (db) => db.query('select accept_job_offer($1)', [candidate.offer_id]),
            { actorRole: 'provider', transitionReason: 'Demo simulator accepted on behalf of a synthetic provider' },
          );
          accepted.push({ jobId: candidate.job_id, providerId: candidate.provider_id });
        } catch (error) {
          // Losing a race is the normal outcome, not a failure: another
          // provider may have accepted between the query and the call.
          skipped.push(error instanceof Error ? error.message.slice(0, 80) : 'unknown');
        }
      }
    }

    logOperation({
      requestId,
      operation: 'demo.tick',
      result: 'ok',
      meta: {
        moved: result.moved,
        advanceMeters: body.advanceMeters,
        expiredOffers: maintenance?.expiredOffers ?? 0,
        autoAccepted: accepted.length,
        autoAcceptSkipped: skipped.length,
      },
    });

    return ok({
      providersMoved: result.moved,
      advanceMeters: body.advanceMeters,
      locationsRefreshed: body.refreshLocations,
      maintenance,
      autoAccepted: accepted,
      // Surfaced rather than swallowed: a demo that quietly fails to accept
      // is a demo that looks broken for no visible reason.
      autoAcceptSkipped: skipped,
    });
  } catch (error) {
    return handleError(error, 'demo.tick', requestId);
  }
}
