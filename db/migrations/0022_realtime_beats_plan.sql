-- ===========================================================================
-- 0022 — The realtime switch outranks the weekly plan for a NOW request
--
-- Found by using it. A provider whose plan is Sun–Thu 08:00–17:00 taps
-- "accepting jobs" at 18:50 and is told they are available; matching says
-- they are not. Cause: the NOW branch consulted provider_planned_covers(),
-- which returns false BOTH for "a date override says no" and for "the weekly
-- plan does not cover this hour". Those are different statements:
--
--   "I'm off today"          → a decision about today. Outranks the switch.
--   "I don't usually work    → a default. The switch is the more specific,
--    at this hour"             more recent and more deliberate signal, and
--                              it is the whole point of the switch.
--
-- Spec §11 puts REALTIME (3) above PLANNED (4) and DATE OVERRIDE (2) above
-- both, which is exactly this distinction. Conflating them meant the
-- "available for two hours" and "available until 18:00" actions silently did
-- nothing outside planned hours — the worst kind of failure, because the
-- provider is told the opposite of what matching will do.
--
-- Fixed by splitting out the override verdict so each layer answers only for
-- itself.
-- ===========================================================================

-- ── What, if anything, does a date override say about this moment? ─────────
-- Returns null when the provider declared no override for that local date,
-- which the caller must distinguish from a definite "no".
create or replace function public.provider_override_verdict(
  p_provider_id  uuid,
  p_at           timestamptz,
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
begin
  v_local     := p_at at time zone v_tz;
  v_end_local := v_local + make_interval(mins => greatest(p_duration_min, 1));
  v_date      := v_local::date;

  select * into v_override
    from public.provider_availability_overrides
   where provider_id = p_provider_id and on_date = v_date;

  if not found then
    return null;
  end if;

  if v_override.kind = 'unavailable' then
    return false;
  end if;

  -- An explicit window for the day: inside it yes, outside it no.
  return v_local::time >= v_override.starts_at
     and v_end_local::time <= v_override.ends_at
     and v_end_local::date = v_date;
end
$$;

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
  v_override     boolean;
begin
  select state, verification, online_until
    into v_state, v_verification, v_online_until
    from public.provider_profiles where id = p_provider_id;

  -- (1) Not verified, or suspended: never, whatever anything else says.
  if v_verification is distinct from 'VERIFIED' then
    return false;
  end if;

  select coalesce((value -> 'nowToleranceMinutes')::int, 20),
         coalesce((value -> 'defaultDurationMinutes')::int, 60)
    into v_tolerance, v_duration
    from public.settings where key = 'availability.rules';

  v_duration  := coalesce(p_duration_min, v_duration, 60);
  v_tolerance := coalesce(v_tolerance, 20);

  -- "Now" means close enough to now that the realtime switch is what counts.
  v_is_now := p_at <= now() + make_interval(mins => v_tolerance);

  -- (2) A date override is a decision about that specific date, so it
  -- outranks both the switch and the plan.
  v_override := public.provider_override_verdict(p_provider_id, p_at, v_duration);
  if v_override is false then
    return false;
  end if;

  if v_is_now then
    -- (3) A NOW request is governed by the switch. A provider who is OFFLINE
    -- is not available however good their weekly schedule looks — and a
    -- provider who is ONLINE outside their usual hours IS available, because
    -- that is what they just said.
    if v_state <> 'ONLINE' then
      return false;
    end if;
    -- A declared end to the shift is a hard end. We check the START of the
    -- job, because the provider said when they stop TAKING work.
    if v_online_until is not null and p_at >= v_online_until then
      return false;
    end if;
  elsif v_override is null then
    -- (4) A future request with no override for that date is governed by the
    -- plan. Being OFFLINE right now says nothing about tomorrow morning
    -- (spec §52). A provider who declared no hours at all stays matchable
    -- through their switch, per availability.rules.noRulesMeansAlwaysPlanned.
    if public.provider_planned_covers(p_provider_id, p_at, v_duration) is not true then
      return false;
    end if;
  end if;
  -- (v_override is true here means an override window covers the slot, which
  -- is a deliberate "yes for this date" and needs no support from the plan.)

  -- (5) Never double-book.
  return not public.provider_has_conflict(p_provider_id, p_at, v_duration, p_exclude_job);
end
$$;

grant execute on function public.provider_override_verdict(uuid, timestamptz, integer)
  to authenticated, service_role;
