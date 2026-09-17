-- ===========================================================================
-- 0018 — Candidate search becomes time-aware
--
-- The previous find_candidate_providers had two assumptions baked in that
-- only hold for an immediate job:
--
--   1. `pp.state = 'ONLINE'` — which makes a scheduled job impossible to fill
--      by anyone who happens to be switched off at the moment of dispatch.
--   2. `join provider_locations` as an INNER join with a freshness cutoff —
--      which excludes every provider whose phone is not currently reporting,
--      even when the job is tomorrow morning and their live position is
--      irrelevant.
--
-- Both are replaced. Availability is now the single answer from
-- provider_is_available_at(), and location is resolved to an EFFECTIVE point:
-- the live fix when it is fresh, otherwise the centre of the provider's
-- declared service area. `location_is_live` tells the scorer which it got, so
-- route opportunity is only ever claimed on live data (spec §29, §70).
-- ===========================================================================

drop function if exists public.find_candidate_providers(uuid, numeric, integer, integer);

create or replace function public.find_candidate_providers(
  p_job_id                    uuid,
  p_radius_km                 numeric,
  p_max_location_age_seconds  integer default 120,
  p_limit                     integer default 50,
  -- The instant the customer wants service. NULL → the job's own requested
  -- time, falling back to now().
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
  candidate as (
    select
      pp.id as provider_id,
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
      coalesce(pc.skills, '{}')::text[] as skills,
      ps.price_ils,
      ps.duration_min,
      job.location as job_location,
      -- Live only when it is genuinely fresh. A stale fix is never treated as
      -- live (spec §18); it simply stops being the reference point.
      (pl.recorded_at is not null
        and pl.recorded_at > now() - make_interval(secs => p_max_location_age_seconds)
      ) as location_is_live,
      pl.location as live_location,
      pl.heading_deg,
      pl.speed_kmh,
      pl.accuracy_m,
      case when pl.recorded_at is null then null
           else extract(epoch from (now() - pl.recorded_at))::numeric end as location_age_seconds,
      pl.destination,
      -- Fallback reference point for a provider who is not reporting: the
      -- centre of the area they said they work in.
      (select sa.center
         from public.service_areas sa
        where sa.provider_id = pp.id and sa.is_active
        order by sa.radius_km desc
        limit 1) as area_center
    from job
    join public.provider_categories pc
          on pc.category_id = job.category_id
    join public.provider_profiles pp
          on pp.id = pc.provider_id
    join public.profiles pr
          on pr.id = pp.id
    left join public.provider_locations pl
          on pl.provider_id = pp.id
    left join public.provider_services ps
          on ps.provider_id = pp.id
         and ps.service_id = job.service_id
         and ps.is_active
    where pp.verification = 'VERIFIED'
      -- Realtime status, planned schedule, date overrides and existing job
      -- conflicts, resolved to one answer for the requested instant.
      and public.provider_is_available_at(pp.id, job.at_ts, job.duration, job.id)
      -- Never re-offer a job the provider already saw.
      and not exists (
        select 1 from public.job_offers o
        where o.job_id = job.id and o.provider_id = pp.id
      )
  ),
  resolved as (
    select c.*,
           coalesce(case when c.location_is_live then c.live_location end, c.area_center) as ref_location
      from candidate c
  )
  select
    r.provider_id, r.full_name, r.business_name, r.state,
    r.rating_avg, r.rating_count, r.completed_jobs, r.cancelled_jobs,
    r.offers_received, r.offers_accepted, r.avg_response_seconds,
    r.years_experience, r.max_radius_km, r.skills, r.price_ils, r.duration_min,
    st_y(r.ref_location::geometry)::double precision,
    st_x(r.ref_location::geometry)::double precision,
    -- Heading and destination are only meaningful alongside a live fix.
    case when r.location_is_live then r.heading_deg end,
    case when r.location_is_live then r.speed_kmh end,
    case when r.location_is_live then r.accuracy_m end,
    r.location_age_seconds,
    case when r.location_is_live then st_y(r.destination::geometry)::double precision end,
    case when r.location_is_live then st_x(r.destination::geometry)::double precision end,
    (st_distance(r.ref_location, r.job_location) / 1000.0)::numeric,
    exists (
      select 1 from public.service_areas sa
      where sa.provider_id = r.provider_id
        and sa.is_active
        and st_dwithin(sa.center, r.job_location, sa.radius_km * 1000)
    ),
    r.location_is_live
  from resolved r
  where r.ref_location is not null
    and st_dwithin(r.ref_location, r.job_location, p_radius_km * 1000)
    and st_dwithin(r.ref_location, r.job_location, r.max_radius_km * 1000)
  order by st_distance(r.ref_location, r.job_location)
  limit greatest(p_limit, 1)
$$;

grant execute on function public.find_candidate_providers(uuid, numeric, integer, integer, timestamptz, integer)
  to service_role;

-- Indexes that matter once the network holds thousands of providers.
create index if not exists provider_categories_provider_idx
  on public.provider_categories(provider_id);
create index if not exists provider_profiles_verified_state_idx
  on public.provider_profiles(verification, state);
create index if not exists job_offers_job_provider_idx
  on public.job_offers(job_id, provider_id);
