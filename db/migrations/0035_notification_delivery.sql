-- ===========================================================================
-- 0035 — notifications that leave the building
--
-- `notifications` rows have been written since 0007 and are delivered to an
-- open browser over SSE. That is in-app delivery, and for this product it is
-- almost worthless on its own: the premise is that a provider hears about a
-- job within seconds, and a provider with the tab closed — which is every
-- provider, most of the time — hears nothing at all. An offer expires in a
-- couple of minutes and nobody ever knew it existed.
--
-- So every notification that needs to reach somebody who is not looking gets
-- an outbox row. The tick attempts it, records the attempt, and retries with
-- a backoff; a delivery that fails is visible instead of lost. There is no
-- real push or SMS provider in this deployment, and the Notifier that stands
-- in for one reports `isReal = false` and is refused in production — the
-- payment adapter's pattern, for the same reason: a fake that admits it is
-- fake is safe, and a fake that does not is a lie with a nice interface.
-- ===========================================================================

create type delivery_status as enum ('PENDING', 'SENT', 'FAILED', 'ABANDONED');
create type delivery_channel as enum ('push', 'sms', 'email');

create table if not exists public.notification_deliveries (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  channel         delivery_channel not null,
  status          delivery_status not null default 'PENDING',
  -- Where it was sent. Recorded as it was AT THE TIME: a provider who changes
  -- their number later must not make the history say we texted the new one.
  destination     text,
  attempts        integer not null default 0,
  last_error      text,
  -- Backoff. The tick picks up rows whose time has come.
  next_attempt_at timestamptz not null default now(),
  sent_at         timestamptz,
  adapter         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists notification_deliveries_touch on public.notification_deliveries;
create trigger notification_deliveries_touch before update on public.notification_deliveries
  for each row execute function public.touch_updated_at();

create index if not exists notification_deliveries_due_idx
  on public.notification_deliveries (next_attempt_at)
  where status = 'PENDING';
create index if not exists notification_deliveries_notification_idx
  on public.notification_deliveries (notification_id);

alter table public.notification_deliveries enable row level security;

-- A person may see whether we tried to reach them and how it went. They may
-- never write it: this is the platform's own record of what it did.
drop policy if exists notification_deliveries_own on public.notification_deliveries;
create policy notification_deliveries_own on public.notification_deliveries
  for select using (user_id = auth.uid() or public.is_admin());

grant select on public.notification_deliveries to authenticated;
grant select, insert, update, delete on public.notification_deliveries to service_role;

-- ── Whose turn it is ───────────────────────────────────────────────────────
--
-- Claimed with FOR UPDATE SKIP LOCKED so two instances ticking at the same
-- moment take different rows instead of sending the same message twice. The
-- claim marks the attempt before the send happens: a crash mid-send costs one
-- delivery rather than looping on it for ever.
create or replace function public.claim_pending_deliveries(p_limit integer)
returns table (
  id uuid,
  notification_id uuid,
  user_id uuid,
  channel text,
  destination text,
  attempts integer,
  title text,
  body text,
  payload jsonb,
  kind text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    select d.id
      from public.notification_deliveries d
     where d.status = 'PENDING'
       and d.next_attempt_at <= now()
     order by d.next_attempt_at
     limit p_limit
       for update skip locked
  ),
  bumped as (
    update public.notification_deliveries d
       set attempts = d.attempts + 1,
           -- Held off until the next window immediately, so a send that never
           -- returns cannot be claimed again by the following tick.
           next_attempt_at = now() + make_interval(mins => power(3, least(d.attempts, 4))::integer)
      from claimed c
     where d.id = c.id
    returning d.id, d.notification_id, d.user_id, d.channel, d.destination, d.attempts
  )
  select b.id, b.notification_id, b.user_id, b.channel::text, b.destination, b.attempts,
         n.title, n.body, n.payload, n.kind
    from bumped b
    join public.notifications n on n.id = b.notification_id;
end;
$$;

revoke all on function public.claim_pending_deliveries(integer) from public;
grant execute on function public.claim_pending_deliveries(integer) to service_role;

comment on function public.claim_pending_deliveries(integer) is
  'Claims due deliveries with SKIP LOCKED so concurrent ticks do not send the '
  'same message twice, and bumps the attempt before the send — see 0035.';
