-- ===========================================================================
-- 0020 — Temporary realtime availability ("זמין לשעתיים", "זמין עד 18:00")
--
-- The realtime switch answers "am I accepting work right now?". In practice a
-- provider almost never means "until I remember to turn this off" — they mean
-- "for the next two hours" or "until six". Without an expiry, the honest
-- options are both bad: leave them ONLINE (and send them jobs after they have
-- stopped working) or make them turn it off manually (which they forget, with
-- the same result).
--
-- So the switch gets an optional end: provider_profiles.online_until. It is
-- enforced in provider_is_available_at rather than only by a background job,
-- because matching must never depend on a sweeper having run. The sweeper
-- exists too (expire_online_windows), so the provider's own screen and the
-- status history tell the same story as matching does.
-- ===========================================================================

alter table public.provider_profiles
  add column if not exists online_until timestamptz;

comment on column public.provider_profiles.online_until is
  'When set, the ONLINE realtime switch stops counting at this moment. NULL means "until turned off".';

-- ── Precedence, with the expiry folded into step 3 ────────────────────────
--   1. UNVERIFIED / SUSPENDED      → never
--   2. DATE OVERRIDE               → decisive for that date
--   3. REALTIME STATUS             → decisive only for a NOW request, and
--                                    only while online_until has not passed
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
  v_online_until timestamptz;
  v_duration     integer;
  v_tolerance    integer;
  v_is_now       boolean;
  v_planned      boolean;
begin
  select state, verification, online_until
    into v_state, v_verification, v_online_until
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

  v_is_now := p_at <= now() + make_interval(mins => v_tolerance);

  v_planned := public.provider_planned_covers(p_provider_id, p_at, v_duration);

  if v_is_now then
    if v_state <> 'ONLINE' then
      return false;                                      -- (3)
    end if;
    -- A declared end to the shift is a hard end. The job would START inside
    -- the window but finish after it; we check the start, because the
    -- provider said when they stop TAKING work, not when they stop working.
    if v_online_until is not null and p_at >= v_online_until then
      return false;
    end if;
    if v_planned is false then
      return false;                                      -- (2)
    end if;
  else
    if v_planned is not true then
      return false;                                      -- (4)
    end if;
  end if;

  return not public.provider_has_conflict(p_provider_id, p_at, v_duration, p_exclude_job);  -- (5)
end
$$;

-- ── The sweeper ───────────────────────────────────────────────────────────
-- Matching is already correct without this; the sweeper exists so the
-- provider's own screen, the admin tower and the status log agree with it.
create or replace function public.expire_online_windows()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids   uuid[];
  v_count integer;
begin
  select array_agg(id) into v_ids
    from public.provider_profiles
   where state = 'ONLINE'
     and online_until is not null
     and online_until <= now();

  if v_ids is null then
    return 0;
  end if;

  update public.provider_profiles
     set state = 'OFFLINE', online_until = null, state_changed_at = now()
   where id = any(v_ids);

  -- Going offline stops tracking, so the stored position must go with it:
  -- a last known fix must never be presented as a live one (spec §18).
  delete from public.provider_locations where provider_id = any(v_ids);

  update public.provider_status_history
     set ended_at = now()
   where provider_id = any(v_ids) and ended_at is null;

  insert into public.provider_status_history (provider_id, state)
  select id, 'OFFLINE' from unnest(v_ids) as t(id);

  v_count := array_length(v_ids, 1);
  return v_count;
end
$$;

revoke all on function public.expire_online_windows() from public;
grant execute on function public.expire_online_windows() to service_role;
