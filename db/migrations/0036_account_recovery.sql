-- ===========================================================================
-- 0036 — getting back in, and proving the contact details are real
--
-- Two holes in the account model, both with the same consequence: a provider
-- who cannot be reached.
--
-- There was no password reset. A provider who forgot their password had no
-- way back in at all — not a degraded path, none — and the only recovery was
-- an admin editing the database. For a marketplace whose supply side is
-- self-employed people using the app a few times a week, that is a slow leak
-- of the whole network.
--
-- And nothing verified an email address or a phone number. Anyone could
-- register with somebody else's email, and — more to the point for this
-- product — the phone number a customer is told to call, and the number the
-- platform texts about a job, was an unchecked string. The notification
-- outbox added in 0035 made that concrete: no phone means no SMS, so a
-- provider with a typo in their number quietly never hears about work.
-- ===========================================================================

-- ── Tokens ─────────────────────────────────────────────────────────────────
--
-- Stored as a SHA-256 hash, like `user_sessions.token_hash`. A reset token is
-- a bearer credential for an account: a database dump must not be a list of
-- working password resets, and neither must a log line or a backup.
create table if not exists public.password_reset_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  -- What asked for it, for an operator looking at a burst of requests.
  requested_ip text,
  created_at  timestamptz not null default now()
);

create index if not exists password_reset_user_idx
  on public.password_reset_tokens (user_id, created_at desc);

alter table public.password_reset_tokens enable row level security;

-- Nobody reads these through the application, not even their owner: the token
-- travels by SMS or email and is presented back, which is the whole point. RLS
-- on with no readable policy says so out loud rather than by omission.
drop policy if exists password_reset_tokens_none on public.password_reset_tokens;
create policy password_reset_tokens_none on public.password_reset_tokens
  for all using (false) with check (false);

grant select, insert, update, delete on public.password_reset_tokens to service_role;

-- ── Contact verification ───────────────────────────────────────────────────
alter table public.profiles
  add column if not exists email_verified_at timestamptz,
  add column if not exists phone_verified_at timestamptz;

comment on column public.profiles.phone_verified_at is
  'When a code sent to this number was entered correctly. A provider with an '
  'unverified number cannot be verified — see migration 0036.';

create table if not exists public.contact_verifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  channel     delivery_channel not null,
  -- The address the code went to, recorded as it was: verifying one number
  -- must not silently verify a different one entered later.
  destination text not null,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    integer not null default 0,
  confirmed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists contact_verifications_user_idx
  on public.contact_verifications (user_id, created_at desc);

alter table public.contact_verifications enable row level security;

-- Same reasoning as the reset tokens: the code is delivered, not read back
-- out of the API. A policy that grants nothing, stated rather than implied.
drop policy if exists contact_verifications_none on public.contact_verifications;
create policy contact_verifications_none on public.contact_verifications
  for all using (false) with check (false);

grant select, insert, update, delete on public.contact_verifications to service_role;

-- ── Housekeeping ───────────────────────────────────────────────────────────
--
-- A used or expired token is a credential with no purpose. Kept for a day so
-- "I clicked it twice" has an explanation, then deleted.
create or replace function public.purge_spent_credentials(p_hours integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare removed integer;
begin
  with gone as (
    delete from public.password_reset_tokens
     where (used_at is not null and used_at < now() - make_interval(hours => p_hours))
        or expires_at < now() - make_interval(hours => p_hours)
    returning id
  )
  select count(*) into removed from gone;

  delete from public.contact_verifications
   where (confirmed_at is not null and confirmed_at < now() - make_interval(hours => p_hours))
      or expires_at < now() - make_interval(hours => p_hours);

  return removed;
end;
$$;

revoke all on function public.purge_spent_credentials(integer) from public;
grant execute on function public.purge_spent_credentials(integer) to service_role;

-- ── Nobody marks their own contact details verified ────────────────────────
--
-- `phone_verified_at` is the basis for a gate — a provider cannot be verified
-- without a reached number — so it is exactly the kind of column a client
-- would love to be able to write. There is no endpoint that lets them today,
-- and "no endpoint today" is not a security model: the guard belongs next to
-- the column, the way `guard_provider_verification` sits next to
-- `verification`.
--
-- Clearing it is always allowed, because that is what changing your number
-- does and it only ever removes trust. Setting it is for the platform.
create or replace function public.guard_contact_verification()
returns trigger
language plpgsql
as $$
begin
  if (new.phone_verified_at is not null
      and new.phone_verified_at is distinct from old.phone_verified_at)
     or (new.email_verified_at is not null
      and new.email_verified_at is distinct from old.email_verified_at) then
    if not public.is_admin() and current_user <> 'service_role' then
      raise exception 'CONTACT_VERIFICATION_FORBIDDEN' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_contact_verification on public.profiles;
create trigger profiles_guard_contact_verification
  before update on public.profiles
  for each row execute function public.guard_contact_verification();

comment on function public.guard_contact_verification() is
  'A user may clear their own verified-contact timestamps by changing the '
  'detail, and may never set them. See migration 0036.';
