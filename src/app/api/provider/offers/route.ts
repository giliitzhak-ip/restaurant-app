import { handleError, ok } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { withUser } from '@/lib/db';
import { availabilityPhrase, availabilitySummary } from '@/domains/availability/summary';
import { newRequestId } from '@/lib/logger';

/**
 * The provider's live offers (spec §19).
 *
 * Returns only what the provider needs to decide in one glance: trade,
 * distance, ETA, price, and whether the job is on their way. RLS restricts
 * the rows to this provider's own offers.
 *
 * Deliberately does NOT return the raw score breakdown — that is internal
 * (spec §34) — nor the customer's exact address before acceptance.
 */
export async function GET() {
  const requestId = newRequestId();
  try {
    const user = await requireRole('provider');

    const offers = await withUser(user.id, (db) =>
      db.many(
        `select o.id, o.job_id, o.price_ils, o.eta_minutes, o.eta_confidence,
                o.distance_km, o.is_on_the_way, o.expires_at, o.notified_at,
                o.wave,
                j.raw_description, j.urgency::text as urgency,
                j.booking_mode::text as booking_mode, j.scheduled_for,
                j.address_text,
                c.name_he as category_name, c.icon as category_icon,
                s.name_he as service_name
           from job_offers o
           join jobs j on j.id = o.job_id
           left join categories c on c.id = j.category_id
           left join services s on s.id = j.service_id
          where o.status = 'PENDING'
            and o.expires_at > now()
            and j.status in ('SEARCHING','OFFERS_AVAILABLE')
          order by o.is_on_the_way desc, o.final_score desc
          limit 20`,
      ),
    );

    const active = await withUser(user.id, (db) =>
      db.one(
        `select a.job_id, a.price_ils, a.eta_minutes, j.status::text as status,
                j.raw_description, j.address_text, j.address_notes,
                st_y(j.location::geometry) as lat, st_x(j.location::geometry) as lon,
                p.full_name as customer_name, p.phone as customer_phone,
                c.name_he as category_name, s.name_he as service_name,
                c.requires_before_after
           from job_assignments a
           join jobs j on j.id = a.job_id
           join profiles p on p.id = j.customer_id
           left join categories c on c.id = j.category_id
           left join services s on s.id = j.service_id
          where a.provider_id = $1
            and j.status in ('PROVIDER_SELECTED','CONFIRMED','EN_ROUTE','ARRIVED',
                             'IN_PROGRESS','AWAITING_CUSTOMER_CONFIRMATION')
          limit 1`,
        [user.id],
      ),
    );

    const profile = await withUser(user.id, (db) =>
      db.one(
        `select pp.state::text as state, pp.verification::text as verification,
                pp.rating_avg, pp.rating_count, pp.completed_jobs,
                p.full_name,
                -- Mirrors what find_candidate_providers actually requires: a
                -- declared trade and at least one priced service. Without
                -- both, the provider is not a weak candidate — the INNER JOIN
                -- means they are absent from the search entirely.
                exists (
                  select 1 from provider_categories pc where pc.provider_id = pp.id
                ) and exists (
                  select 1 from provider_services ps
                   where ps.provider_id = pp.id and ps.is_active and ps.price_ils is not null
                ) as is_configured
           from provider_profiles pp
           join profiles p on p.id = pp.id
          where pp.id = $1`,
        [user.id],
      ),
    );

    // The provider home shows availability as one line, so it ships with this
    // payload rather than costing a second round-trip on a screen that polls.
    const availability = profile ? await availabilitySummary(user.id) : null;

    return ok({
      offers,
      active,
      profile,
      availability: availability
        ? { ...availability, phrase: availabilityPhrase(availability, new Date()) }
        : null,
    });
  } catch (error) {
    return handleError(error, 'provider.offers', requestId);
  }
}
