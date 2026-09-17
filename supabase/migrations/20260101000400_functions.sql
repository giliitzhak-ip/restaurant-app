-- ============================================================================
-- GET SERVICE — 0005  Domain functions, triggers and geo search
-- ============================================================================

-- ── RLS helper functions ────────────────────────────────────────────────────
-- SECURITY DEFINER so that evaluating a policy never re-enters the same policy.

create or replace function public.auth_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select role = 'admin' from public.users where id = auth.uid()), false);
$$;

create or replace function public.current_provider_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from public.provider_profiles where user_id = auth.uid();
$$;

-- A provider may read a job while it is broadcast to them, and forever after
-- if they were assigned to it. A customer may read their own jobs.
create or replace function public.can_access_job(target_job uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.jobs j
    where j.id = target_job
      and (
        j.customer_id = auth.uid()
        or j.assigned_provider_id = public.current_provider_id()
        or exists (
          select 1 from public.job_assignments a
          where a.job_id = j.id and a.provider_id = public.current_provider_id()
        )
      )
  ) or public.is_admin();
$$;

-- Chat is limited to the two parties actually working together on a job.
create or replace function public.can_chat_on_job(target_job uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.jobs j
    where j.id = target_job
      and j.assigned_provider_id is not null
      and (j.customer_id = auth.uid() or j.assigned_provider_id = public.current_provider_id())
  );
$$;

-- ── Settings accessor ───────────────────────────────────────────────────────
create or replace function public.get_setting(setting_key text, fallback jsonb default 'null'::jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select value from public.settings where key = setting_key), fallback);
$$;

-- ── New-user provisioning ───────────────────────────────────────────────────
-- Creates the application rows for a freshly signed-up auth user. The role is
-- read from the signup metadata but can never be 'admin' from the client side.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requested_role public.user_role;
  display_name   text;
begin
  requested_role := case
    when new.raw_user_meta_data ->> 'role' = 'provider' then 'provider'::public.user_role
    else 'customer'::public.user_role
  end;

  display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(new.email, ''), '@', 1),
    ''
  );

  insert into public.users (id, email, phone, role)
  values (new.id, new.email, new.phone, requested_role)
  on conflict (id) do nothing;

  insert into public.profiles (user_id, full_name, phone)
  values (new.id, display_name, new.phone)
  on conflict (user_id) do nothing;

  if requested_role = 'customer' then
    insert into public.customer_profiles (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  else
    insert into public.provider_profiles (user_id, business_name, owner_name, phone, email)
    values (new.id, coalesce(nullif(display_name, ''), 'עסק חדש'), display_name,
            coalesce(new.phone, ''), new.email)
    on conflict (user_id) do nothing;

    insert into public.provider_availability (provider_id, is_available)
    select id, false from public.provider_profiles where user_id = new.id
    on conflict (provider_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Job status history ──────────────────────────────────────────────────────
create or replace function public.log_job_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.job_status_history (job_id, from_status, to_status, actor_id, actor_type)
    values (new.id, null, new.status, new.customer_id, 'customer');
  elsif new.status is distinct from old.status then
    insert into public.job_status_history (job_id, from_status, to_status, actor_id, actor_type)
    values (new.id, old.status, new.status, auth.uid(),
            case
              when auth.uid() = new.customer_id then 'customer'::public.actor_type
              when auth.uid() is null then 'system'::public.actor_type
              else 'provider'::public.actor_type
            end);
  end if;
  return new;
end;
$$;

drop trigger if exists log_job_status on public.jobs;
create trigger log_job_status
  after insert or update of status on public.jobs
  for each row execute function public.log_job_status_change();

-- ── Provider rating aggregation ─────────────────────────────────────────────
create or replace function public.refresh_provider_rating()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target uuid := coalesce(new.provider_id, old.provider_id);
begin
  update public.provider_profiles p
  set rating_avg = coalesce(agg.avg_rating, 0),
      rating_count = coalesce(agg.cnt, 0)
  from (
    select round(avg(rating)::numeric, 2) as avg_rating, count(*) as cnt
    from public.reviews
    where provider_id = target and not is_hidden
  ) agg
  where p.id = target;
  return null;
end;
$$;

drop trigger if exists refresh_rating on public.reviews;
create trigger refresh_rating
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_provider_rating();

-- ── Provider response-time & completion counters ────────────────────────────
create or replace function public.track_offer_response_time()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  broadcast timestamptz;
begin
  select coalesce(j.broadcast_at, j.created_at) into broadcast
  from public.jobs j where j.id = new.job_id;

  if broadcast is not null then
    new.responded_in_seconds := greatest(0, extract(epoch from (now() - broadcast))::integer);
  end if;

  update public.provider_profiles p
  set avg_response_seconds = case
        when p.avg_response_seconds is null then new.responded_in_seconds
        else ((p.avg_response_seconds * 4) + new.responded_in_seconds) / 5
      end
  where p.id = new.provider_id and new.responded_in_seconds is not null;

  return new;
end;
$$;

drop trigger if exists track_offer_response on public.job_offers;
create trigger track_offer_response
  before insert on public.job_offers
  for each row execute function public.track_offer_response_time();

create or replace function public.track_job_completion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed'
     and new.assigned_provider_id is not null then
    update public.provider_profiles
    set completed_jobs = completed_jobs + 1
    where id = new.assigned_provider_id;
  end if;

  if new.status = 'cancelled' and old.status is distinct from 'cancelled'
     and new.assigned_provider_id is not null and new.cancelled_by = 'provider' then
    update public.provider_profiles
    set cancelled_jobs = cancelled_jobs + 1
    where id = new.assigned_provider_id;
  end if;

  return null;
end;
$$;

drop trigger if exists track_completion on public.jobs;
create trigger track_completion
  after update of status on public.jobs
  for each row execute function public.track_job_completion();

-- ── Geo search: find_nearby_providers ───────────────────────────────────────
-- Returns the candidate pool for a job. Filtering only — the ranking weights
-- live in the match engine so that admins can tune them without a migration.
create or replace function public.find_nearby_providers(
  category_id uuid,
  latitude    double precision,
  longitude   double precision,
  radius_km   double precision default 5,
  service_id  uuid default null,
  max_results integer default 50
)
returns table (
  provider_id          uuid,
  user_id              uuid,
  business_name        text,
  owner_name           text,
  avatar_url           text,
  bio                  text,
  years_experience     integer,
  base_price           numeric,
  rating_avg           numeric,
  rating_count         integer,
  completed_jobs       integer,
  cancelled_jobs       integer,
  avg_response_seconds integer,
  is_available         boolean,
  location_age_seconds integer,
  distance_km          double precision,
  serves_area          boolean,
  matches_service      boolean
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  with origin as (
    select extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography as g
  ),
  candidates as (
    select
      p.id,
      p.user_id,
      p.business_name,
      p.owner_name,
      p.avatar_url,
      p.bio,
      p.years_experience,
      p.base_price,
      p.rating_avg,
      p.rating_count,
      p.completed_jobs,
      p.cancelled_jobs,
      p.avg_response_seconds,
      coalesce(av.is_available, false) as is_available,
      case when pl.updated_at is null then null
           else greatest(0, extract(epoch from (now() - pl.updated_at))::integer) end as location_age_seconds,
      -- Live position when we have a recent one, otherwise the service-area centre.
      coalesce(
        extensions.st_distance(pl.coordinates, (select g from origin)),
        (select min(extensions.st_distance(sa.center, (select g from origin)))
           from public.service_areas sa where sa.provider_id = p.id)
      ) / 1000.0 as distance_km,
      exists (
        select 1 from public.service_areas sa
        where sa.provider_id = p.id
          and extensions.st_dwithin(sa.center, (select g from origin), sa.radius_km * 1000)
      ) as serves_area,
      (find_nearby_providers.service_id is null or exists (
        select 1 from public.provider_services ps
        where ps.provider_id = p.id and ps.service_id = find_nearby_providers.service_id
      )) as matches_service
    from public.provider_profiles p
    join public.provider_categories pc
      on pc.provider_id = p.id and pc.category_id = find_nearby_providers.category_id
    join public.users u
      on u.id = p.user_id and u.status = 'active'
    left join public.provider_availability av on av.provider_id = p.id
    left join public.provider_locations pl on pl.provider_id = p.id
    where p.status = 'verified'
  )
  select
    c.id, c.user_id, c.business_name, c.owner_name, c.avatar_url, c.bio,
    c.years_experience, c.base_price, c.rating_avg, c.rating_count,
    c.completed_jobs, c.cancelled_jobs, c.avg_response_seconds, c.is_available,
    c.location_age_seconds, c.distance_km, c.serves_area, c.matches_service
  from candidates c
  where c.distance_km is not null
    and (c.distance_km <= find_nearby_providers.radius_km or c.serves_area)
  order by c.distance_km asc
  limit greatest(1, least(coalesce(max_results, 50), 200));
$$;

comment on function public.find_nearby_providers is
  'Candidate discovery for a job: verified, active, category-matched providers within radius (or whose declared service area covers the job). Ranking happens in the match engine.';
