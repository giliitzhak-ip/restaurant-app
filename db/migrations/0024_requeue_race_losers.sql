-- ===========================================================================
-- 0024 — Losing a race is not the same as having had your chance
--
-- find_candidate_providers() excluded any provider with ANY offer row for the
-- job. That is right for someone who declined, ignored, or holds an offer —
-- and wrong for someone whose offer was CANCELLED because a competitor
-- accepted first. Under first-accept-wins that is most of the wave, every
-- time.
--
-- The consequence was a dead end on both re-dispatch paths:
--
--   * a provider accepts and then withdraws (CANCELLED_BY_PROVIDER) — the
--     three others who lost the race are excluded, so wave 1 finds nobody;
--   * the customer rejects the match — same thing, and the request dies
--     instead of reaching the next-best provider.
--
-- Caught by the first test written for customer rejection: with two providers
-- in range, rejecting one produced zero offers and the second was never
-- asked, even though they had done nothing but lose by a second.
--
-- Exactly two places set CANCELLED, and they mean opposite things:
--   accept_job_offer()  → "someone else won"   (decline_reason null)
--   rejectMatch()       → "the customer said no to YOU" (marker set)
-- so decline_reason is what tells them apart.
--
-- Everything else in this function is unchanged from 0019, including the
-- filter ordering that keeps the query at ~36ms over 1,000 providers.
-- ===========================================================================

drop function if exists public.find_candidate_providers(uuid, numeric, integer, integer, timestamptz, integer);

create or replace function public.find_candidate_providers(
  p_job_id                    uuid,
  p_radius_km                 numeric,
  p_max_location_age_seconds  integer default 120,
  p_limit                     integer default 50,
  p_at                        timestamptz default null,
  p_duration_min              integer default null
)
returns table (
  provider_id           uuid,
  full_name             text,
  business_name         text,
  state                 provider_state,
  rating_avg            numeric,
  rating_count          integer,
  completed_jobs        integer,
  cancelled_jobs        integer,
  offers_received       integer,
  offers_accepted       integer,
  avg_response_seconds  integer,
  years_experience      integer,
  max_radius_km         numeric,
  skills                text[],
  price_ils             numeric,
  duration_min          integer,
  lat                   double precision,
  lon                   double precision,
  heading_deg           numeric,
  speed_kmh             numeric,
  accuracy_m            numeric,
  location_age_seconds  numeric,
  dest_lat              double precision,
  dest_lon              double precision,
  straight_distance_km  numeric,
  in_service_area       boolean,
  location_is_live      boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with job as (
    select j.id, j.location, j.category_id, j.service_id,
           coalesce(p_at, j.requested_for, now()) as at_ts,
           coalesce(p_duration_min, j.duration_min, s.duration_min,
                    c.default_duration_min, 60) as duration
      from public.jobs j
      left join public.services s on s.id = j.service_id
      left join public.categories c on c.id = j.category_id
     where j.id = p_job_id
  ),
  -- Stage 1: cheap, index-backed predicates only.
  nearby as (
    select
      pp.id as provider_id,
      job.id as job_id,
      job.at_ts,
      job.duration,
      job.location as job_location,
      job.service_id,
      (pl.recorded_at is not null
        and pl.recorded_at > now() - make_interval(secs => p_max_location_age_seconds)
      ) as location_is_live,
      pl.location as live_location,
      pl.heading_deg,
      pl.speed_kmh,
      pl.accuracy_m,
      pl.destination,
      case when pl.recorded_at is null then null
           else extract(epoch from (now() - pl.recorded_at))::numeric end as location_age_seconds,
      coalesce(
        case
          when pl.recorded_at is not null
           and pl.recorded_at > now() - make_interval(secs => p_max_location_age_seconds)
          then pl.location
        end,
        (select sa.center
           from public.service_areas sa
          where sa.provider_id = pp.id and sa.is_active
          order by sa.radius_km desc
          limit 1)
      ) as ref_location,
      pp.max_radius_km
    from job
    join public.provider_categories pc on pc.category_id = job.category_id
    join public.provider_profiles pp on pp.id = pc.provider_id
    left join public.provider_locations pl on pl.provider_id = pp.id
    where pp.verification = 'VERIFIED'
  ),
  in_range as (
    select n.*
      from nearby n
     where n.ref_location is not null
       and st_dwithin(n.ref_location, n.job_location, p_radius_km * 1000)
       and st_dwithin(n.ref_location, n.job_location, n.max_radius_km * 1000)
  ),
  -- Stage 2: the expensive checks, only for providers still in the running.
  eligible as (
    select r.*
      from in_range r
     where not exists (
             -- A provider is out of the running for this job only if they
             -- actually HAD their chance on it: an offer still live, one they
             -- declined, one they let expire, one they hold, or one the
             -- customer rejected them on specifically.
             --
             -- An offer CANCELLED with no decline_reason is none of those:
             -- accept_job_offer() closes every competing offer when someone
             -- wins, so those providers were never given the chance. Excluding
             -- them meant that after the winner withdrew — or after the
             -- customer rejected them — re-dispatch skipped everyone who had
             -- merely lost the race, which in a thin market is everyone.
             select 1 from public.job_offers o
              where o.job_id = r.job_id
                and o.provider_id = r.provider_id
                and (
                  o.status <> 'CANCELLED'
                  or o.decline_reason is not null
                )
           )
       and public.provider_is_available_at(r.provider_id, r.at_ts, r.duration, r.job_id)
     order by st_distance(r.ref_location, r.job_location)
     limit greatest(p_limit, 1)
  )
  select
    e.provider_id,
    pr.full_name,
    pp.business_name,
    pp.state,
    pp.rating_avg,
    pp.rating_count,
    pp.completed_jobs,
    pp.cancelled_jobs,
    pp.offers_received,
    pp.offers_accepted,
    pp.avg_response_seconds,
    pp.years_experience,
    pp.max_radius_km,
    coalesce(pc.skills, '{}')::text[],
    ps.price_ils,
    ps.duration_min,
    st_y(e.ref_location::geometry)::double precision,
    st_x(e.ref_location::geometry)::double precision,
    -- Heading, speed and destination are only meaningful with a live fix, so
    -- they are withheld otherwise rather than passed on as if current.
    case when e.location_is_live then e.heading_deg end,
    case when e.location_is_live then e.speed_kmh end,
    case when e.location_is_live then e.accuracy_m end,
    e.location_age_seconds,
    case when e.location_is_live then st_y(e.destination::geometry)::double precision end,
    case when e.location_is_live then st_x(e.destination::geometry)::double precision end,
    (st_distance(e.ref_location, e.job_location) / 1000.0)::numeric,
    exists (
      select 1 from public.service_areas sa
      where sa.provider_id = e.provider_id
        and sa.is_active
        and st_dwithin(sa.center, e.job_location, sa.radius_km * 1000)
    ),
    e.location_is_live
  from eligible e
  join public.provider_profiles pp on pp.id = e.provider_id
  join public.profiles pr on pr.id = e.provider_id
  join public.provider_categories pc
        on pc.provider_id = e.provider_id
       and pc.category_id = (select category_id from job)
  left join public.provider_services ps
        on ps.provider_id = e.provider_id
       and ps.service_id = e.service_id
       and ps.is_active
  order by st_distance(e.ref_location, e.job_location)
$$;

grant execute on function public.find_candidate_providers(uuid, numeric, integer, integer, timestamptz, integer)
  to service_role;

-- Backs the service-area fallback lookup, which runs once per candidate.
create index if not exists service_areas_provider_active_idx
  on public.service_areas(provider_id, radius_km desc)
  where is_active;
