import { z } from 'zod';
import { handleError, ok } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { withUser } from '@/lib/db';
import { newRequestId } from '@/lib/logger';

const paramsSchema = z.object({ id: z.uuid() });

/**
 * MATCHING DEBUGGER (spec §34).
 *
 * Explains why each provider ranked where they did, from the telemetry
 * recorded at dispatch time — not by re-running the engine, so it shows the
 * decision that was actually made, with the weights that were in force then.
 *
 * Admin-only. Raw scoring is never exposed to customers.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    const user = await requireRole('admin');
    const { id } = paramsSchema.parse(await context.params);

    const data = await withUser(user.id, async (db) => {
      const job = await db.one(
        `select j.id, j.status::text as status, j.raw_description, j.understanding,
                j.dispatch_wave, j.dispatch_radius_km, j.urgency::text as urgency,
                st_y(j.location::geometry) as lat, st_x(j.location::geometry) as lon,
                c.name_he as category_name, s.name_he as service_name, s.base_price_ils
           from jobs j
           left join categories c on c.id = j.category_id
           left join services s on s.id = j.service_id
          where j.id = $1`,
        [id],
      );

      const candidates = await db.many(
        `select me.provider_id, p.full_name, me.wave,
                me.excluded_reason,
                me.route_opportunity_score, me.skill_score, me.availability_score,
                me.eta_score, me.reliability_score, me.rating_score,
                me.price_score, me.experience_score, me.final_score,
                me.weights_used,
                me.is_on_the_way, me.route_deviation_min, me.route_deviation_km,
                me.straight_distance_km, me.route_distance_km,
                me.eta_minutes, me.eta_confidence,
                me.provider_heading_deg,
                st_y(me.provider_location::geometry) as provider_lat,
                st_x(me.provider_location::geometry) as provider_lon,
                st_y(me.provider_destination::geometry) as dest_lat,
                st_x(me.provider_destination::geometry) as dest_lon,
                me.notified_at, me.responded_at, me.response_seconds,
                me.accepted, me.rejected, me.expired,
                o.status::text as offer_status, o.price_ils
           from matching_events me
           join profiles p on p.id = me.provider_id
           left join job_offers o on o.id = me.offer_id
          where me.job_id = $1
          order by me.excluded_reason nulls first, me.final_score desc nulls last`,
        [id],
      );

      const offers = await db.many(
        `select o.id, o.provider_id, p.full_name, o.status::text as status,
                o.final_score, o.score_breakdown, o.is_on_the_way,
                o.eta_minutes, o.eta_confidence, o.price_ils,
                o.notified_at, o.expires_at, o.responded_at, o.wave
           from job_offers o join profiles p on p.id = o.provider_id
          where o.job_id = $1
          order by o.final_score desc`,
        [id],
      );

      return { job, candidates, offers };
    });

    return ok(data);
  } catch (error) {
    return handleError(error, 'admin.matching', requestId);
  }
}
