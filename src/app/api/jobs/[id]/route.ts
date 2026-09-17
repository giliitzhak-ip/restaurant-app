import { z } from 'zod';
import { ApiError, handleError, ok } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { withUser } from '@/lib/db';
import { newRequestId } from '@/lib/logger';

const paramsSchema = z.object({ id: z.uuid() });

/**
 * Job detail.
 *
 * No ownership check is written here on purpose: RLS decides what this user
 * can see. A stranger's job simply does not exist from their connection, so
 * the handler returns 404 without ever having read the row (spec §23).
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    const user = await requireUser();
    const { id } = paramsSchema.parse(await context.params);

    const data = await withUser(user.id, async (db) => {
      const job = await db.one(
        `select j.id, j.status::text as status, j.raw_description, j.urgency::text as urgency,
                j.booking_mode::text as booking_mode, j.scheduled_for,
                j.understanding, j.address_text, j.address_notes,
                st_y(j.location::geometry) as lat, st_x(j.location::geometry) as lon,
                j.location_accuracy_m, j.quoted_price_ils, j.final_price_ils,
                j.dispatch_wave, j.dispatch_radius_km, j.created_at, j.matched_at,
                j.customer_id,
                c.name_he as category_name, c.slug as category_slug,
                c.requires_before_after,
                s.name_he as service_name, s.slug as service_slug, s.base_price_ils
           from jobs j
           left join categories c on c.id = j.category_id
           left join services s on s.id = j.service_id
          where j.id = $1`,
        [id],
      );

      if (!job) return null;

      // Assignment + the matched provider's public profile.
      const assignment = await db.one(
        `select a.id, a.provider_id, a.price_ils, a.eta_minutes,
                a.assigned_at, a.en_route_at, a.arrived_at, a.started_at, a.completed_at,
                p.full_name as provider_name, pp.business_name,
                pp.rating_avg, pp.rating_count, pp.completed_jobs,
                -- The route-opportunity verdict from the offer that was
                -- accepted. It is only ever true on real evidence — a stated
                -- destination or a measured heading — never on proximity
                -- alone, so showing it to the customer is not a route claim
                -- we cannot support (spec §12, §72).
                o.is_on_the_way
           from job_assignments a
           join profiles p on p.id = a.provider_id
           join provider_profiles pp on pp.id = a.provider_id
           left join job_offers o on o.id = a.offer_id
          where a.job_id = $1`,
        [id],
      );

      const payment = await db.one(
        `select id, status::text as status, gross_amount, platform_fee,
                provider_amount, refunded_amount, currency, provider_name,
                authorized_at, captured_at
           from payments where job_id = $1`,
        [id],
      );

      const reviews = await db.many(
        `select id, direction, rating, comment, author_id, created_at
           from reviews where job_id = $1`,
        [id],
      );

      return { job, assignment, payment, reviews };
    });

    if (!data?.job) {
      throw new ApiError('NOT_FOUND', 'העבודה לא נמצאה', 404);
    }

    return ok(data);
  } catch (error) {
    return handleError(error, 'jobs.get', requestId);
  }
}
