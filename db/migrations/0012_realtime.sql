-- ===========================================================================
-- 0012 — Realtime change notifications (spec §24)
--
-- The database emits NOTIFY on every change that a client is waiting for.
-- src/domains/notifications/ turns these into SSE streams. The payload is
-- deliberately an IDENTIFIER, not the row: clients re-read the authoritative
-- row through RLS, so realtime can never become a data-leak path or a second
-- source of truth (spec §22).
-- ===========================================================================

create or replace function public.notify_job_change()
returns trigger
language plpgsql
-- SECURITY DEFINER: resolving who to notify must see the real rows,
-- not the caller's RLS-filtered view of them.
security definer
set search_path = public
as $$
declare
  v_provider_id uuid;
begin
  select ja.provider_id into v_provider_id
  from public.job_assignments ja where ja.job_id = new.id;

  perform pg_notify('gs_job_change', json_build_object(
    'job_id',      new.id,
    'customer_id', new.customer_id,
    'provider_id', v_provider_id,
    'status',      new.status,
    'at',          extract(epoch from now())
  )::text);
  return new;
end
$$;

drop trigger if exists jobs_notify on public.jobs;
create trigger jobs_notify after insert or update on public.jobs
  for each row execute function public.notify_job_change();

create or replace function public.notify_offer_change()
returns trigger
language plpgsql
as $$
begin
  perform pg_notify('gs_offer_change', json_build_object(
    'offer_id',    new.id,
    'job_id',      new.job_id,
    'provider_id', new.provider_id,
    'status',      new.status,
    'at',          extract(epoch from now())
  )::text);
  return new;
end
$$;

drop trigger if exists job_offers_notify on public.job_offers;
create trigger job_offers_notify after insert or update on public.job_offers
  for each row execute function public.notify_offer_change();

-- Location updates are only broadcast while a job is actually in flight.
-- An ONLINE-but-idle provider is not continuously broadcast to anyone
-- (spec §17, §18).
create or replace function public.notify_provider_location()
returns trigger
language plpgsql
-- SECURITY DEFINER: resolving who to notify must see the real rows,
-- not the caller's RLS-filtered view of them.
security definer
set search_path = public
as $$
declare
  v_job record;
begin
  select j.id, j.customer_id into v_job
  from public.job_assignments ja
  join public.jobs j on j.id = ja.job_id
  where ja.provider_id = new.provider_id
    and j.status in ('CONFIRMED','EN_ROUTE','ARRIVED','IN_PROGRESS')
  limit 1;

  if v_job.id is not null then
    perform pg_notify('gs_provider_location', json_build_object(
      'job_id',      v_job.id,
      'customer_id', v_job.customer_id,
      'provider_id', new.provider_id,
      'at',          extract(epoch from new.recorded_at)
    )::text);
  end if;
  return new;
end
$$;

drop trigger if exists provider_locations_notify on public.provider_locations;
create trigger provider_locations_notify after insert or update on public.provider_locations
  for each row execute function public.notify_provider_location();

create or replace function public.notify_notification()
returns trigger
language plpgsql
as $$
begin
  perform pg_notify('gs_notification', json_build_object(
    'notification_id', new.id,
    'user_id',         new.user_id,
    'kind',            new.kind
  )::text);
  return new;
end
$$;

drop trigger if exists notifications_notify on public.notifications;
create trigger notifications_notify after insert on public.notifications
  for each row execute function public.notify_notification();
