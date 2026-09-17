-- ===========================================================================
-- 0010 — Candidate search and transactional offer acceptance
-- ===========================================================================

-- ── CandidateFinder + GeoFilter (spec §13) ────────────────────────────────
-- Returns providers who could plausibly serve a job, with the raw signals the
-- TypeScript scoring pipeline needs. Ranking deliberately does NOT happen
-- here: scoring lives in the domain layer so it is unit-testable and
-- configurable (spec §13, §14).
--
-- p_max_location_age_seconds is the staleness cutoff. A provider whose last
-- fix is older than this is NOT returned: a stale location is never treated
-- as live (spec §18).
create or replace function public.find_candidate_providers(
  p_job_id                    uuid,
  p_radius_km                 numeric,
  p_max_location_age_seconds  integer default 120,
  p_limit                     integer default 50
)
returns table (
  provider_id         uuid,
  full_name           text,
  business_name       text,
  state               provider_state,
  rating_avg          numeric,
  rating_count        integer,
  completed_jobs      integer,
  cancelled_jobs      integer,
  offers_received     integer,
  offers_accepted     integer,
  avg_response_seconds integer,
  years_experience    integer,
  max_radius_km       numeric,
  skills              text[],
  price_ils           numeric,
  duration_min        integer,
  lat                 double precision,
  lon                 double precision,
  heading_deg         numeric,
  speed_kmh           numeric,
  accuracy_m          numeric,
  location_age_seconds numeric,
  dest_lat            double precision,
  dest_lon            double precision,
  straight_distance_km numeric,
  in_service_area     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with job as (
    select j.id, j.location, j.category_id, j.service_id
    from public.jobs j
    where j.id = p_job_id
  )
  select
    pp.id,
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
    st_y(pl.location::geometry)::double precision,
    st_x(pl.location::geometry)::double precision,
    pl.heading_deg,
    pl.speed_kmh,
    pl.accuracy_m,
    extract(epoch from (now() - pl.recorded_at))::numeric,
    st_y(pl.destination::geometry)::double precision,
    st_x(pl.destination::geometry)::double precision,
    (st_distance(pl.location, job.location) / 1000.0)::numeric,
    exists (
      select 1 from public.service_areas sa
      where sa.provider_id = pp.id
        and sa.is_active
        and st_dwithin(sa.center, job.location, sa.radius_km * 1000)
    )
  from job
  join public.provider_categories pc
        on pc.category_id = job.category_id
  join public.provider_profiles pp
        on pp.id = pc.provider_id
  join public.profiles pr
        on pr.id = pp.id
  join public.provider_locations pl
        on pl.provider_id = pp.id
  left join public.provider_services ps
        on ps.provider_id = pp.id
       and ps.service_id = job.service_id
       and ps.is_active
  where pp.verification = 'VERIFIED'
    -- Only providers who are actually available right now.
    and pp.state = 'ONLINE'
    -- Live location only (spec §18).
    and pl.recorded_at > now() - make_interval(secs => p_max_location_age_seconds)
    -- Inside the current dispatch wave radius AND the provider's own limit.
    and st_dwithin(pl.location, job.location, p_radius_km * 1000)
    and st_dwithin(pl.location, job.location, pp.max_radius_km * 1000)
    -- Never re-offer a job the provider already saw or declined.
    and not exists (
      select 1 from public.job_offers o
      where o.job_id = job.id and o.provider_id = pp.id
    )
    -- Never offer a provider a second concurrent job.
    and not exists (
      select 1
      from public.job_assignments ja
      join public.jobs j2 on j2.id = ja.job_id
      where ja.provider_id = pp.id
        and j2.status in ('PROVIDER_SELECTED','CONFIRMED','EN_ROUTE','ARRIVED',
                          'IN_PROGRESS','AWAITING_CUSTOMER_CONFIRMATION')
    )
  order by st_distance(pl.location, job.location)
  limit greatest(p_limit, 1)
$$;

-- ── Transactional acceptance (spec §25) ───────────────────────────────────
-- Guarantees, under concurrent acceptance of the same job:
--   * exactly one provider wins;
--   * the loser gets JOB_ALREADY_ASSIGNED;
--   * an expired or already-answered offer can never be accepted;
--   * the job's status advances exactly once.
--
-- The serialisation point is `select ... from jobs ... for update`, backed by
-- the UNIQUE constraint on job_assignments.job_id as a second line of defence.
create or replace function public.accept_job_offer(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller       uuid := auth.uid();
  v_job_id       uuid;
  v_job          public.jobs;
  v_offer        public.job_offers;
  v_assignment   public.job_assignments;
begin
  if v_caller is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  select job_id into v_job_id from public.job_offers where id = p_offer_id;
  if v_job_id is null then
    raise exception 'OFFER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Serialise all acceptances for this job.
  select * into v_job from public.jobs where id = v_job_id for update;

  -- Re-read the offer under the job lock so no decision uses a stale row.
  select * into v_offer from public.job_offers where id = p_offer_id for update;

  if v_offer.provider_id <> v_caller then
    raise exception 'OFFER_NOT_YOURS' using errcode = '42501';
  end if;

  if exists (select 1 from public.job_assignments where job_id = v_job_id) then
    raise exception 'JOB_ALREADY_ASSIGNED' using errcode = '55000';
  end if;

  if v_offer.status <> 'PENDING' then
    raise exception 'OFFER_NOT_PENDING: %', v_offer.status using errcode = '55000';
  end if;

  if v_offer.expires_at <= now() then
    update public.job_offers set status = 'EXPIRED', responded_at = now()
    where id = p_offer_id;
    raise exception 'OFFER_EXPIRED' using errcode = '55000';
  end if;

  if v_job.status not in ('SEARCHING','OFFERS_AVAILABLE') then
    raise exception 'JOB_NOT_ACCEPTING_OFFERS: %', v_job.status using errcode = '55000';
  end if;

  insert into public.job_assignments (job_id, provider_id, offer_id, price_ils, eta_minutes)
  values (v_job_id, v_caller, p_offer_id, v_offer.price_ils, v_offer.eta_minutes)
  returning * into v_assignment;

  update public.job_offers
     set status = 'ACCEPTED', responded_at = now()
   where id = p_offer_id;

  -- Every competing offer is closed out in the same transaction.
  update public.job_offers
     set status = 'CANCELLED', responded_at = now()
   where job_id = v_job_id
     and id <> p_offer_id
     and status = 'PENDING';

  perform set_config('app.actor_role', 'provider', true);
  update public.jobs
     set status = 'PROVIDER_SELECTED',
         matched_at = now(),
         quoted_price_ils = v_offer.price_ils
   where id = v_job_id;

  -- Provider is now committed to this job.
  update public.provider_profiles
     set state = 'BUSY', state_changed_at = now()
   where id = v_caller;

  update public.matching_events
     set accepted = true,
         responded_at = now(),
         response_seconds = extract(epoch from (now() - v_offer.notified_at))
   where offer_id = p_offer_id;

  update public.provider_profiles
     set offers_accepted = offers_accepted + 1
   where id = v_caller;

  return jsonb_build_object(
    'assignment_id', v_assignment.id,
    'job_id', v_job_id,
    'provider_id', v_caller,
    'price_ils', v_offer.price_ils,
    'eta_minutes', v_offer.eta_minutes
  );
end
$$;

-- Expire offers whose window has closed. Idempotent; safe to call often.
create or replace function public.expire_stale_offers()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.job_offers
       set status = 'EXPIRED', responded_at = now()
     where status = 'PENDING' and expires_at <= now()
    returning id
  )
  select count(*) into v_count from expired;

  update public.matching_events me
     set expired = true
   where me.offer_id in (
     select id from public.job_offers where status = 'EXPIRED'
   ) and me.accepted = false and me.rejected = false;

  return v_count;
end
$$;
