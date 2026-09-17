-- ===========================================================================
-- 0017 — Availability: planned schedule, overrides, and one deterministic
--        answer to "can this provider serve this job at this time?"
--
-- Before this migration the only notion of availability was
-- provider_profiles.state (OFFLINE/ONLINE/BUSY) — a realtime switch. There
-- was no way for a provider to say "I work Sundays 08:00–18:00", so a
-- scheduled job could only ever match someone who happened to be online at
-- the moment of dispatch. Spec §7 requires BOTH concepts, and §52 requires
-- that changing the requested time actually changes who is eligible.
--
-- Four distinct questions, four distinct sources (spec §10):
--   realtime status   → can I take a job RIGHT NOW?          provider_profiles.state
--   planned schedule  → when am I generally available?       provider_availability_rules
--   override          → is a specific date different?        provider_availability_overrides
--   location          → where am I?                          provider_locations
-- ===========================================================================

-- The existing table called `provider_availability` is a LOG of realtime
-- state changes, not availability. The name actively misleads now that real
-- planned availability exists, so it is renamed for what it is.
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'provider_availability')
     and not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'provider_status_history')
  then
    alter table public.provider_availability rename to provider_status_history;
    alter index if exists provider_availability_provider_idx rename to provider_status_history_provider_idx;
  end if;
end
$$;

comment on table public.provider_status_history is
  'Append-only log of realtime OFFLINE/ONLINE/BUSY changes. NOT planned availability — see provider_availability_rules.';

-- ── What time is the customer asking for? ─────────────────────────────────
-- Availability cannot be evaluated without a requested instant, so the job's
-- timing lives here rather than in a separate migration.
--
-- `booking_mode` stays for the category configuration it drives
-- (supports_now / supports_schedule / supports_compare); `timing_intent` is
-- the customer-facing model from spec §6 and is what matching reads.
do $$ begin
  create type timing_intent as enum ('NOW', 'ASAP', 'SCHEDULED');
exception when duplicate_object then null; end $$;

alter table public.jobs
  add column if not exists timing_intent timing_intent not null default 'NOW';

-- The instant matching evaluates against. NULL means "as soon as possible",
-- which the matcher resolves to now() — it is deliberately not back-filled
-- with a fabricated timestamp.
alter table public.jobs
  add column if not exists requested_for timestamptz;

-- Expected on-site duration, resolved from the service or category at
-- creation time so availability windows can be checked honestly (spec §53).
alter table public.jobs
  add column if not exists duration_min integer
  check (duration_min is null or duration_min between 5 and 1440);

-- Back-fill from what the existing rows already mean.
update public.jobs
   set timing_intent = case when booking_mode = 'SCHEDULE' then 'SCHEDULED'::timing_intent
                            else 'NOW'::timing_intent end
 where timing_intent = 'NOW' and booking_mode = 'SCHEDULE';

update public.jobs
   set requested_for = scheduled_for
 where requested_for is null and scheduled_for is not null;

create index if not exists jobs_requested_for_idx
  on public.jobs(requested_for)
  where requested_for is not null;

-- ── Planned weekly availability ────────────────────────────────────────────
-- Multiple windows per weekday are supported (e.g. 08:00–13:00 and
-- 16:00–20:00), because split shifts are normal in these trades.
create table if not exists public.provider_availability_rules (
  id           uuid primary key default gen_random_uuid(),
  provider_id  uuid not null references public.provider_profiles(id) on delete cascade,
  -- 0 = Sunday … 6 = Saturday, matching extract(dow) and the Israeli week.
  weekday      smallint not null check (weekday between 0 and 6),
  starts_at    time not null,
  ends_at      time not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- A window must be a window. Overnight shifts are modelled as two rows on
  -- two weekdays rather than as an inverted range, which keeps every
  -- comparison below a simple containment test.
  constraint provider_availability_rules_window check (ends_at > starts_at)
);

drop trigger if exists provider_availability_rules_touch on public.provider_availability_rules;
create trigger provider_availability_rules_touch before update on public.provider_availability_rules
  for each row execute function public.touch_updated_at();

create index if not exists provider_availability_rules_lookup_idx
  on public.provider_availability_rules(provider_id, weekday)
  where is_active;

-- ── Date-specific overrides ────────────────────────────────────────────────
-- "Not today", "today I finish at 14:00", "available for the next two hours".
-- An override REPLACES the planned schedule for that date; it never merges
-- with it, so the answer stays predictable (spec §11).
create table if not exists public.provider_availability_overrides (
  id           uuid primary key default gen_random_uuid(),
  provider_id  uuid not null references public.provider_profiles(id) on delete cascade,
  on_date      date not null,
  -- 'unavailable' → the whole day is off, whatever the weekly schedule says.
  -- 'window'      → these hours replace the weekly schedule for this date.
  kind         text not null check (kind in ('unavailable', 'window')),
  starts_at    time,
  ends_at      time,
  note         text check (note is null or length(note) <= 200),
  created_at   timestamptz not null default now(),
  constraint provider_availability_overrides_window check (
    (kind = 'unavailable' and starts_at is null and ends_at is null)
    or (kind = 'window' and starts_at is not null and ends_at is not null and ends_at > starts_at)
  ),
  -- One decision per provider per day: two contradictory overrides for the
  -- same date is exactly the unpredictable state spec §11 forbids.
  unique (provider_id, on_date)
);

create index if not exists provider_availability_overrides_lookup_idx
  on public.provider_availability_overrides(provider_id, on_date);

-- ── Timezone ───────────────────────────────────────────────────────────────
-- Planned hours are wall-clock local time: "Sundays 08:00–18:00" must keep
-- meaning 08:00 local across daylight-saving changes, so the comparison
-- converts the instant into local time rather than storing a fixed offset.
insert into public.settings (key, value, description) values
  ('availability.timezone', '"Asia/Jerusalem"'::jsonb,
   'IANA timezone that provider planned hours are expressed in.'),
  ('availability.rules', '{
     "noRulesMeansAlwaysPlanned": true,
     "nowToleranceMinutes": 20,
     "travelBufferMinutes": 15,
     "defaultDurationMinutes": 60,
     "maxLookaheadDays": 14
   }'::jsonb,
   'Availability evaluation parameters. noRulesMeansAlwaysPlanned keeps a provider who never set hours matchable via their realtime switch.')
on conflict (key) do nothing;

create or replace function public.availability_timezone()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value #>> '{}' from public.settings where key = 'availability.timezone'),
    'Asia/Jerusalem'
  )
$$;

-- ── Does the PLANNED schedule cover [at, at + duration)? ──────────────────
-- Returns null when the provider has declared no schedule at all, which the
-- caller distinguishes from a definite "no".
create or replace function public.provider_planned_covers(
  p_provider_id uuid,
  p_at          timestamptz,
  p_duration_min integer
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz        text := public.availability_timezone();
  v_local     timestamp;
  v_end_local timestamp;
  v_date      date;
  v_override  public.provider_availability_overrides;
  v_has_rules boolean;
begin
  v_local     := p_at at time zone v_tz;
  v_end_local := v_local + make_interval(mins => greatest(p_duration_min, 1));
  v_date      := v_local::date;

  -- A job that would run past midnight is evaluated against the start day
  -- only. Splitting it would imply a precision the data does not support.
  select * into v_override
    from public.provider_availability_overrides
   where provider_id = p_provider_id and on_date = v_date;

  if found then
    if v_override.kind = 'unavailable' then
      return false;
    end if;
    return v_local::time >= v_override.starts_at
       and v_end_local::time <= v_override.ends_at
       and v_end_local::date = v_date;
  end if;

  select exists (
    select 1 from public.provider_availability_rules
     where provider_id = p_provider_id and is_active
  ) into v_has_rules;

  if not v_has_rules then
    return null;   -- "not declared", not "unavailable"
  end if;

  return exists (
    select 1
      from public.provider_availability_rules r
     where r.provider_id = p_provider_id
       and r.is_active
       and r.weekday = extract(dow from v_local)::smallint
       and v_local::time >= r.starts_at
       and v_end_local::time <= r.ends_at
       and v_end_local::date = v_date
  );
end
$$;

-- ── Is the provider already committed at that time? ───────────────────────
-- Considers accepted jobs, their expected duration and a travel buffer, so a
-- provider is not double-booked (spec §54).
create or replace function public.provider_has_conflict(
  p_provider_id  uuid,
  p_at           timestamptz,
  p_duration_min integer,
  p_exclude_job  uuid default null
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with config as (
    select coalesce((value -> 'travelBufferMinutes')::int, 15) as buffer
      from public.settings where key = 'availability.rules'
  ),
  window_req as (
    select p_at as starts_at,
           p_at + make_interval(mins => greatest(p_duration_min, 1)) as ends_at
  )
  select exists (
    select 1
      from public.job_assignments ja
      join public.jobs j on j.id = ja.job_id
      left join public.services s on s.id = j.service_id
      left join public.categories c on c.id = j.category_id
      cross join config
      cross join window_req w
     where ja.provider_id = p_provider_id
       and (p_exclude_job is null or j.id <> p_exclude_job)
       and j.status in ('PROVIDER_SELECTED','CONFIRMED','EN_ROUTE','ARRIVED',
                        'IN_PROGRESS','AWAITING_CUSTOMER_CONFIRMATION')
       -- Where the other job sits in time: its scheduled slot if it has one,
       -- otherwise treat it as occupying the present.
       and tstzrange(
             coalesce(j.requested_for, j.matched_at, j.created_at) - make_interval(mins => config.buffer),
             coalesce(j.requested_for, j.matched_at, j.created_at)
               + make_interval(mins => coalesce(s.duration_min, c.default_duration_min, 60) + config.buffer),
             '[)'
           )
           && tstzrange(w.starts_at, w.ends_at, '[)')
  )
$$;

-- ── The single answer (spec §11 precedence) ───────────────────────────────
--   1. SUSPENDED / UNVERIFIED      → never
--   2. DATE OVERRIDE               → decisive for that date
--   3. REALTIME STATUS             → decisive only for a NOW request
--   4. PLANNED SCHEDULE            → decisive for a future request
--   5. JOB CONFLICT                → never double-book
--   6. otherwise                   → matchable
create or replace function public.provider_is_available_at(
  p_provider_id  uuid,
  p_at           timestamptz,
  p_duration_min integer default null,
  p_exclude_job  uuid default null
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_state        provider_state;
  v_verification verification_status;
  v_duration     integer;
  v_tolerance    integer;
  v_is_now       boolean;
  v_planned      boolean;
begin
  select state, verification into v_state, v_verification
    from public.provider_profiles where id = p_provider_id;

  if v_verification is distinct from 'VERIFIED' then
    return false;                                        -- (1)
  end if;

  select coalesce((value -> 'nowToleranceMinutes')::int, 20),
         coalesce((value -> 'defaultDurationMinutes')::int, 60)
    into v_tolerance, v_duration
    from public.settings where key = 'availability.rules';

  v_duration  := coalesce(p_duration_min, v_duration, 60);
  v_tolerance := coalesce(v_tolerance, 20);

  -- "Now" means close enough to now that the realtime switch is what counts.
  v_is_now := p_at <= now() + make_interval(mins => v_tolerance);

  v_planned := public.provider_planned_covers(p_provider_id, p_at, v_duration);

  if v_is_now then
    -- (3) A NOW request is governed by the realtime switch: a provider who is
    -- OFFLINE is not available however good their weekly schedule looks.
    if v_state <> 'ONLINE' then
      return false;
    end if;
    -- (2) An explicit "not today" still wins over being switched on.
    if v_planned is false then
      return false;
    end if;
  else
    -- (4) A future request is governed by the plan. Being OFFLINE right now
    -- says nothing about tomorrow morning (spec §52).
    if v_planned is not true then
      return false;
    end if;
  end if;

  return not public.provider_has_conflict(p_provider_id, p_at, v_duration, p_exclude_job);  -- (5)
end
$$;

-- ── When can this provider next serve me? (spec §55) ──────────────────────
-- Scans forward in 30-minute steps, which is accurate enough for a
-- human-readable "next availability" and cheap enough to call per profile.
create or replace function public.provider_next_available_at(
  p_provider_id  uuid,
  p_from         timestamptz default now(),
  p_duration_min integer default null
) returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cursor    timestamptz;
  v_limit     timestamptz;
  v_days      integer;
begin
  select coalesce((value -> 'maxLookaheadDays')::int, 14) into v_days
    from public.settings where key = 'availability.rules';

  -- Round up to the next half hour so the answer reads as a clock time.
  v_cursor := date_trunc('hour', p_from)
              + case when extract(minute from p_from) < 30
                     then interval '30 minutes' else interval '1 hour' end;
  v_limit := p_from + make_interval(days => coalesce(v_days, 14));

  while v_cursor <= v_limit loop
    if public.provider_is_available_at(p_provider_id, v_cursor, p_duration_min) then
      return v_cursor;
    end if;
    v_cursor := v_cursor + interval '30 minutes';
  end loop;

  return null;
end
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.provider_availability_rules     enable row level security;
alter table public.provider_availability_overrides enable row level security;

-- A provider manages their own hours. Customers do NOT read these tables:
-- they get a single "next available" answer through a function, so a
-- provider's full personal schedule is never exposed (spec §56).
drop policy if exists provider_availability_rules_own on public.provider_availability_rules;
create policy provider_availability_rules_own on public.provider_availability_rules
  for all using (provider_id = auth.uid() or public.is_admin())
  with check (provider_id = auth.uid() or public.is_admin());

drop policy if exists provider_availability_overrides_own on public.provider_availability_overrides;
create policy provider_availability_overrides_own on public.provider_availability_overrides
  for all using (provider_id = auth.uid() or public.is_admin())
  with check (provider_id = auth.uid() or public.is_admin());

drop policy if exists provider_status_history_own on public.provider_status_history;
create policy provider_status_history_own on public.provider_status_history
  for select using (provider_id = auth.uid() or public.is_admin());

grant select, insert, update, delete on public.provider_availability_rules to authenticated;
grant select, insert, update, delete on public.provider_availability_overrides to authenticated;
grant select on public.provider_status_history to authenticated;

grant execute on function public.availability_timezone() to authenticated, service_role;
grant execute on function public.provider_planned_covers(uuid, timestamptz, integer) to authenticated, service_role;
grant execute on function public.provider_has_conflict(uuid, timestamptz, integer, uuid) to authenticated, service_role;
grant execute on function public.provider_is_available_at(uuid, timestamptz, integer, uuid) to authenticated, service_role;
grant execute on function public.provider_next_available_at(uuid, timestamptz, integer) to authenticated, service_role;
