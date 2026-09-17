-- ===========================================================================
-- 0033 — rate limits that survive a restart and span instances
--
-- The limiter was a Map in the Node process. Documented as a limitation
-- rather than hidden (R-008), which is better than pretending, but it means
-- the limits do not actually hold:
--
--   * a restart clears every window, so ten failed logins followed by a
--     deploy is ten more failed logins;
--   * behind two instances each gets its own full allowance, so the real
--     limit is the configured one times the instance count, and an attacker
--     who reconnects gets a fresh bucket roughly half the time.
--
-- The counter belongs where the rest of the state is. One statement, atomic
-- under concurrency, and the window resets by comparing a stored timestamp
-- rather than by anybody sweeping.
-- ===========================================================================

create table if not exists public.rate_limits (
  key        text primary key,
  count      integer not null,
  reset_at   timestamptz not null,
  updated_at timestamptz not null default now()
);

-- Not user data and never read by a user: only the platform touches it.
alter table public.rate_limits enable row level security;
grant select, insert, update, delete on public.rate_limits to service_role;

-- RLS on with no policy already denies everyone, and that is what this table
-- wants — but silence is indistinguishable from an oversight, which is why
-- the security harness fails a table in that state. So the intent is written
-- down: no user of this application may ever read or write a rate-limit row.
-- `service_role` holds BYPASSRLS and is the only thing that touches it.
drop policy if exists rate_limits_system_only on public.rate_limits;
create policy rate_limits_system_only on public.rate_limits
  for all using (false) with check (false);

create index if not exists rate_limits_reset_idx on public.rate_limits (reset_at);

/**
 * Count one hit against `p_key` and say whether it is allowed.
 *
 * The whole decision is one INSERT ... ON CONFLICT, which is what makes it
 * correct under concurrency: two simultaneous requests serialise on the row
 * rather than both reading a stale count. The window is data, so an expired
 * one resets in the same statement — the previous implementation needed a
 * sweeper for that, and a sweeper that does not run is a limiter that leaks.
 */
create or replace function public.rate_limit_hit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  row_count integer;
  row_reset timestamptz;
begin
  insert into public.rate_limits as rl (key, count, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update
    set count = case when rl.reset_at <= now() then 1 else rl.count + 1 end,
        reset_at = case
                     when rl.reset_at <= now()
                       then now() + make_interval(secs => p_window_seconds)
                     else rl.reset_at
                   end,
        updated_at = now()
  returning rl.count, rl.reset_at into row_count, row_reset;

  return query select
    row_count <= p_limit,
    greatest(0, p_limit - row_count),
    case when row_count <= p_limit then 0
         else greatest(1, ceil(extract(epoch from (row_reset - now())))::integer)
    end;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

/** Drop windows that closed. Housekeeping, not correctness. */
create or replace function public.purge_expired_rate_limits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare removed integer;
begin
  with gone as (
    delete from public.rate_limits where reset_at < now() - interval '1 hour'
    returning key
  )
  select count(*) into removed from gone;
  return removed;
end;
$$;

revoke all on function public.purge_expired_rate_limits() from public;
grant execute on function public.purge_expired_rate_limits() to service_role;
