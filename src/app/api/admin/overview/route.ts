import { handleError, ok } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { withUser } from '@/lib/db';
import { newRequestId } from '@/lib/logger';

/**
 * Admin control tower metrics (spec §33).
 *
 * Read through the ADMIN's own connection, so the RLS admin policies are the
 * thing granting access. If the is_admin() check were wrong, this endpoint
 * would return nothing rather than leaking the platform's books.
 */
export async function GET() {
  const requestId = newRequestId();
  try {
    const user = await requireRole('admin');

    const data = await withUser(user.id, async (db) => {
      const counters = await db.one<Record<string, string>>(`
        select
          (select count(*) from provider_profiles where state = 'ONLINE') as providers_online,
          (select count(*) from provider_profiles where state = 'BUSY')   as providers_busy,
          (select count(*) from provider_profiles where verification = 'PENDING') as providers_pending,
          (select count(*) from jobs where status in
             ('PROVIDER_SELECTED','CONFIRMED','EN_ROUTE','ARRIVED','IN_PROGRESS',
              'AWAITING_CUSTOMER_CONFIRMATION')) as active_jobs,
          (select count(*) from jobs where status in ('SEARCHING','OFFERS_AVAILABLE')) as searching_jobs,
          (select count(*) from jobs where status = 'CANCELLED_BY_SYSTEM'
             and created_at > now() - interval '24 hours') as unmatched_jobs,
          (select count(*) from jobs where status = 'EN_ROUTE') as en_route,
          (select count(*) from disputes where status in ('OPEN','UNDER_REVIEW')) as open_disputes,
          (select count(*) from jobs where status in ('COMPLETED','PAID','REVIEWED')
             and updated_at::date = current_date) as completed_today,
          (select coalesce(sum(gross_amount),0) from payments
             where status = 'CAPTURED' and captured_at::date = current_date) as revenue_today_agorot,
          (select coalesce(sum(platform_fee),0) from payments
             where status = 'CAPTURED' and captured_at::date = current_date) as platform_fees_today_agorot
      `);

      /* ── Analytics (spec §37). North star: successful completions. ──── */
      const analytics = await db.one<Record<string, string | null>>(`
        with recent as (
          select * from jobs where created_at > now() - interval '7 days'
        ),
        first_offer as (
          select o.job_id, min(o.notified_at) as first_at
            from job_offers o join recent r on r.id = o.job_id
           group by o.job_id
        )
        select
          (select count(*) from recent where status in ('COMPLETED','PAID','REVIEWED')) as completions_7d,
          (select round(avg(extract(epoch from (f.first_at - r.created_at)))::numeric, 1)
             from first_offer f join recent r on r.id = f.job_id) as time_to_first_offer_s,
          (select round(avg(extract(epoch from (r.matched_at - r.created_at)))::numeric, 1)
             from recent r where r.matched_at is not null) as time_to_match_s,
          (select round(100.0 * count(*) filter (where matched_at is not null)
                        / greatest(count(*),1), 1) from recent) as match_rate_pct,
          (select round(100.0 * count(*) filter (where status in ('COMPLETED','PAID','REVIEWED'))
                        / greatest(count(*),1), 1) from recent) as completion_rate_pct,
          -- status is an enum, so LIKE needs an explicit cast to text.
          (select round(100.0 * count(*) filter (where status::text like 'CANCELLED%')
                        / greatest(count(*),1), 1) from recent) as cancellation_rate_pct,
          (select round(100.0 * count(*) filter (where status = 'CANCELLED_BY_SYSTEM')
                        / greatest(count(*),1), 1) from recent) as unmatched_rate_pct,
          (select round(100.0 * count(*) filter (where accepted) / greatest(count(*),1), 1)
             from matching_events where offer_id is not null
              and created_at > now() - interval '7 days') as acceptance_rate_pct,
          (select round(avg(response_seconds)::numeric, 1) from matching_events
             where responded_at is not null and created_at > now() - interval '7 days')
             as provider_response_time_s,
          (select round(avg(final_price_ils)::numeric, 2) from recent
             where final_price_ils is not null) as average_job_value_ils
      `);

      const liveJobs = await db.many(`
        select j.id, j.status::text as status, j.raw_description, j.urgency::text as urgency,
               st_y(j.location::geometry) as lat, st_x(j.location::geometry) as lon,
               j.dispatch_wave, j.created_at,
               c.name_he as category_name,
               p.full_name as customer_name,
               pr.full_name as provider_name
          from jobs j
          left join categories c on c.id = j.category_id
          left join profiles p on p.id = j.customer_id
          left join job_assignments a on a.job_id = j.id
          left join profiles pr on pr.id = a.provider_id
         where j.status in ('REQUESTED','SEARCHING','OFFERS_AVAILABLE','PROVIDER_SELECTED',
                            'CONFIRMED','EN_ROUTE','ARRIVED','IN_PROGRESS',
                            'AWAITING_CUSTOMER_CONFIRMATION')
         order by j.created_at desc
         limit 50
      `);

      // Live provider positions for the map (spec §33).
      const liveProviders = await db.many(`
        select pp.id, p.full_name, pp.state::text as state,
               st_y(pl.location::geometry) as lat, st_x(pl.location::geometry) as lon,
               pl.heading_deg,
               round(extract(epoch from (now() - pl.recorded_at))::numeric) as age_seconds,
               c.name_he as category_name
          from provider_profiles pp
          join profiles p on p.id = pp.id
          join provider_locations pl on pl.provider_id = pp.id
          left join provider_categories pc on pc.provider_id = pp.id and pc.is_primary
          left join categories c on c.id = pc.category_id
         where pp.state <> 'OFFLINE'
         limit 200
      `);

      const pendingVerification = await db.many(`
        select pp.id, p.full_name, p.email, pp.created_at,
               pp.verification::text as verification,
               c.name_he as category_name,
               (select count(*) from provider_services ps
                 where ps.provider_id = pp.id and ps.is_active
                   and ps.price_ils is not null)::int as priced_services,
               -- Verifying a provider who has declared no trade changes
               -- nothing: the candidate search would still never return them.
               -- Surfaced so an admin is not approving a dead account.
               (c.id is not null) as is_configured,
               -- Which required documents are still outstanding. The verify
               -- action refuses while this is non-empty, so showing it here
               -- is the difference between a reviewer knowing and a reviewer
               -- finding out by clicking.
               provider_missing_documents(pp.id) as missing_documents,
               -- The documents themselves, so a decision can be made from
               -- this one screen. No storage_path: the locator is not the
               -- client's business, and the file is fetched by id.
               coalesce((
                 select json_agg(json_build_object(
                          'id', d.id, 'docType', d.doc_type,
                          'docNumber', d.doc_number,
                          'originalFilename', d.original_filename,
                          'contentType', d.content_type,
                          'sizeBytes', d.size_bytes,
                          'status', d.status::text,
                          -- Text, not a date: see the note in
                          -- /api/provider/documents.
                          'expiresOn', to_char(d.expires_on, 'YYYY-MM-DD'),
                          'reviewNotes', d.review_notes,
                          'createdAt', d.created_at)
                          order by d.created_at)
                   from provider_documents d
                  where d.provider_id = pp.id
               ), '[]'::json) as documents
          from provider_profiles pp
          join profiles p on p.id = pp.id
          left join provider_categories pc on pc.provider_id = pp.id and pc.is_primary
          left join categories c on c.id = pc.category_id
         where pp.verification = 'PENDING'
         order by pp.created_at
         limit 50
      `);

      /* Provider-proposed trades awaiting a decision. Ordered oldest first:
         a review queue that is not FIFO quietly abandons its tail. */
      const tradeProposals = await db.many(`
        select tp.id, tp.proposed_name, tp.description, tp.price_ils, tp.created_at,
               p.full_name as provider_name, p.email as provider_email,
               pp.verification::text as provider_verification,
               sc.name_he as suggested_category_name,
               sc.slug as suggested_category_slug,
               -- Does the catalog already cover this? A near-duplicate is the
               -- most likely outcome, and approving one creates a second
               -- service meaning the same thing.
               (select count(*)::int from services s
                 where s.is_active and s.name_he ilike '%' || btrim(tp.proposed_name) || '%') as similar_services
          from trade_proposals tp
          join provider_profiles pp on pp.id = tp.provider_id
          join profiles p on p.id = tp.provider_id
          left join categories sc on sc.id = tp.suggested_category_id
         where tp.status = 'PENDING'
         order by tp.created_at
         limit 50
      `);

      // The categories a proposal may be filed under. Needed by the review
      // form, and small enough to ship with the page it is used on.
      const categories = await db.many(
        `select slug, name_he from categories where is_active order by sort_order`,
      );

      /*
       * Every list above is capped. Without the totals the admin cannot tell
       * "50 providers awaiting verification" from "the first 50 of 300" — and
       * a queue that looks finished when it is not is worse than a long one.
       */
      const totals = await db.one<{
        pending_verification: number;
        pending_trades: number;
        live_providers: number;
        live_jobs: number;
      }>(`
        select
          (select count(*) from provider_profiles where verification = 'PENDING')::int
            as pending_verification,
          (select count(*) from trade_proposals where status = 'PENDING')::int
            as pending_trades,
          (select count(*) from provider_profiles pp
             join provider_locations pl on pl.provider_id = pp.id
            where pp.state <> 'OFFLINE')::int as live_providers,
          (select count(*) from jobs
            where status in ('REQUESTED','SEARCHING','OFFERS_AVAILABLE',
                             'PROVIDER_SELECTED','CONFIRMED','EN_ROUTE',
                             'ARRIVED','IN_PROGRESS',
                             'AWAITING_CUSTOMER_CONFIRMATION'))::int as live_jobs
      `);

      return {
        counters,
        analytics,
        liveJobs,
        liveProviders,
        pendingVerification,
        tradeProposals,
        categories,
        totals: {
          pendingVerification: totals?.pending_verification ?? 0,
          pendingTrades: totals?.pending_trades ?? 0,
          liveProviders: totals?.live_providers ?? 0,
          liveJobs: totals?.live_jobs ?? 0,
        },
        shown: {
          pendingVerification: pendingVerification.length,
          tradeProposals: tradeProposals.length,
          liveProviders: liveProviders.length,
          liveJobs: liveJobs.length,
        },
      };
    });

    return ok(data);
  } catch (error) {
    return handleError(error, 'admin.overview', requestId);
  }
}
