-- ===========================================================================
-- 0009 — Job state machine, enforced in the database (spec §20, §22)
--
-- The legal transitions live in a TABLE, not in a CASE statement and not in
-- application code. The database is the source of truth; the TypeScript state
-- machine is asserted against this table by tests/integration, so the two can
-- never silently diverge.
-- ===========================================================================

create table if not exists public.job_transitions (
  from_status  job_status not null,
  to_status    job_status not null,
  -- Who is allowed to drive this transition.
  allow_customer boolean not null default false,
  allow_provider boolean not null default false,
  allow_admin    boolean not null default true,
  allow_system   boolean not null default false,
  note           text,
  primary key (from_status, to_status)
);

insert into public.job_transitions
  (from_status, to_status, allow_customer, allow_provider, allow_admin, allow_system, note)
values
  -- Intake and matching
  ('REQUESTED','SEARCHING',                       false,false,true,true,  'Dispatch begins'),
  ('REQUESTED','CANCELLED_BY_CUSTOMER',           true, false,true,false, 'Customer aborts before dispatch'),
  ('REQUESTED','CANCELLED_BY_SYSTEM',             false,false,true,true,  'Classification or validation failure'),
  ('SEARCHING','OFFERS_AVAILABLE',                false,false,true,true,  'At least one offer outstanding'),
  ('SEARCHING','CANCELLED_BY_CUSTOMER',           true, false,true,false, null),
  ('SEARCHING','CANCELLED_BY_SYSTEM',             false,false,true,true,  'No provider found after final wave'),
  ('OFFERS_AVAILABLE','PROVIDER_SELECTED',        false,true, true,false, 'Provider accepted the offer'),
  ('OFFERS_AVAILABLE','SEARCHING',                false,false,true,true,  'All offers expired; widen search'),
  ('OFFERS_AVAILABLE','CANCELLED_BY_CUSTOMER',    true, false,true,false, null),
  ('OFFERS_AVAILABLE','CANCELLED_BY_SYSTEM',      false,false,true,true,  null),

  -- Confirmation
  ('PROVIDER_SELECTED','CONFIRMED',               true, false,true,false, 'Customer confirms the match'),
  ('PROVIDER_SELECTED','SEARCHING',               false,false,true,true,  'Provider withdrew before confirmation'),
  ('PROVIDER_SELECTED','CANCELLED_BY_CUSTOMER',   true, false,true,false, null),
  ('PROVIDER_SELECTED','CANCELLED_BY_PROVIDER',   false,true, true,false, null),
  ('PROVIDER_SELECTED','CANCELLED_BY_SYSTEM',     false,false,true,true,  'Confirmation window elapsed'),

  -- Execution
  ('CONFIRMED','EN_ROUTE',                        false,true, true,false, null),
  ('CONFIRMED','CANCELLED_BY_CUSTOMER',           true, false,true,false, null),
  ('CONFIRMED','CANCELLED_BY_PROVIDER',           false,true, true,false, 'Returns the job to matching'),
  ('CONFIRMED','CANCELLED_BY_SYSTEM',             false,false,true,true,  null),
  ('EN_ROUTE','ARRIVED',                          false,true, true,false, null),
  ('EN_ROUTE','CANCELLED_BY_CUSTOMER',            true, false,true,false, null),
  ('EN_ROUTE','CANCELLED_BY_PROVIDER',            false,true, true,false, null),
  ('EN_ROUTE','CANCELLED_BY_SYSTEM',              false,false,true,true,  null),
  ('ARRIVED','IN_PROGRESS',                       false,true, true,false, null),
  ('ARRIVED','CANCELLED_BY_CUSTOMER',             true, false,true,false, null),
  ('ARRIVED','CANCELLED_BY_PROVIDER',             false,true, true,false, null),
  ('ARRIVED','DISPUTED',                          true, true, true,false, null),
  ('IN_PROGRESS','AWAITING_CUSTOMER_CONFIRMATION',false,true, true,false, 'Provider marks work done'),
  ('IN_PROGRESS','DISPUTED',                      true, true, true,false, null),
  ('IN_PROGRESS','CANCELLED_BY_PROVIDER',         false,true, true,false, null),

  -- Completion, money, review
  ('AWAITING_CUSTOMER_CONFIRMATION','COMPLETED',  true, false,true,true,  'Customer confirms, or auto-confirm window elapses'),
  ('AWAITING_CUSTOMER_CONFIRMATION','DISPUTED',   true, false,true,false, null),
  ('COMPLETED','PAID',                            false,false,true,true,  'Set only by a captured payment'),
  ('COMPLETED','DISPUTED',                        true, true, true,false, null),
  ('PAID','REVIEWED',                             true, true, true,true,  null),
  ('PAID','DISPUTED',                             true, true, true,false, null),
  ('REVIEWED','DISPUTED',                         true, true, true,false, null),

  -- Dispute resolution
  ('DISPUTED','COMPLETED',                        false,false,true,false, 'Admin resolves in provider favour'),
  ('DISPUTED','PAID',                             false,false,true,false, null),
  ('DISPUTED','CANCELLED_BY_SYSTEM',              false,false,true,false, 'Admin voids the job'),

  -- Provider cancellation re-enters matching (spec §44)
  ('CANCELLED_BY_PROVIDER','SEARCHING',           false,false,true,true,  'Re-dispatch after provider cancellation')
on conflict (from_status, to_status) do nothing;

-- ── Transition guard ──────────────────────────────────────────────────────
create or replace function public.can_transition(
  p_from job_status,
  p_to   job_status,
  p_actor text default null      -- 'customer' | 'provider' | 'admin' | 'system'
) returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.job_transitions t
    where t.from_status = p_from
      and t.to_status   = p_to
      and (
        p_actor is null
        or (p_actor = 'customer' and t.allow_customer)
        or (p_actor = 'provider' and t.allow_provider)
        or (p_actor = 'admin'    and t.allow_admin)
        or (p_actor = 'system'   and t.allow_system)
      )
  )
$$;

-- Every status change is validated and recorded, no matter which code path
-- performed the UPDATE (spec §20: "validated server-side").
create or replace function public.enforce_job_transition()
returns trigger
language plpgsql
-- SECURITY DEFINER: the audit trail must be written even though users
-- have no INSERT privilege on job_status_history (spec §26 must not be
-- bypassable, and must not be forgeable either).
security definer
set search_path = public
as $$
declare
  v_actor_role text := nullif(current_setting('app.actor_role', true), '');
  v_actor_id   uuid := auth.uid();
begin
  if new.status = old.status then
    return new;
  end if;

  if not public.can_transition(old.status, new.status, null) then
    raise exception 'INVALID_TRANSITION: % -> %', old.status, new.status
      using errcode = '23514';
  end if;

  if v_actor_role is not null
     and not public.can_transition(old.status, new.status, v_actor_role) then
    raise exception 'TRANSITION_NOT_PERMITTED_FOR_ROLE: % -> % by %',
      old.status, new.status, v_actor_role
      using errcode = '42501';
  end if;

  insert into public.job_status_history (job_id, from_status, to_status, actor_id, actor_role, reason)
  values (new.id, old.status, new.status, v_actor_id, v_actor_role,
          nullif(current_setting('app.transition_reason', true), ''));

  return new;
end
$$;

drop trigger if exists jobs_enforce_transition on public.jobs;
create trigger jobs_enforce_transition
  before update of status on public.jobs
  for each row execute function public.enforce_job_transition();

-- Record the creation of a job as the first timeline entry (spec §26).
create or replace function public.record_job_created()
returns trigger
language plpgsql
-- SECURITY DEFINER: the audit trail must be written even though users
-- have no INSERT privilege on job_status_history (spec §26 must not be
-- bypassable, and must not be forgeable either).
security definer
set search_path = public
as $$
begin
  insert into public.job_status_history (job_id, from_status, to_status, actor_id, actor_role, reason)
  values (new.id, null, new.status, auth.uid(),
          nullif(current_setting('app.actor_role', true), ''), 'Request created');
  return new;
end
$$;

drop trigger if exists jobs_record_created on public.jobs;
create trigger jobs_record_created
  after insert on public.jobs
  for each row execute function public.record_job_created();
