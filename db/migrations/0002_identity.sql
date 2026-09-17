-- ===========================================================================
-- 0002 — Identity: profiles, customer/provider profiles, sessions
-- ===========================================================================

create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  role           user_role   not null,
  full_name      text        not null check (length(btrim(full_name)) between 2 and 120),
  phone          text        unique check (phone is null or phone ~ '^\+?[0-9]{7,15}$'),
  email          text        unique,
  avatar_url     text,
  locale         text        not null default 'he',
  is_demo        boolean     not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create index if not exists profiles_role_idx on public.profiles(role);

-- ── Role helpers ──────────────────────────────────────────────────────────
-- Defined here rather than in 0001 because a `language sql` body is validated
-- at creation time and these read public.profiles.
-- Admin check. SECURITY DEFINER so it can read `profiles` without being
-- filtered by the very RLS policies that call it (which would recurse).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
$$;

create or replace function public.current_role_name()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ── Customer profile ──────────────────────────────────────────────────────
create table if not exists public.customer_profiles (
  id                  uuid primary key references public.profiles(id) on delete cascade,
  default_address     text,
  default_location    geography(Point, 4326),
  rating_avg          numeric(3,2) check (rating_avg is null or rating_avg between 1 and 5),
  rating_count        integer  not null default 0 check (rating_count >= 0),
  completed_jobs      integer  not null default 0 check (completed_jobs >= 0),
  cancelled_jobs      integer  not null default 0 check (cancelled_jobs >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists customer_profiles_touch on public.customer_profiles;
create trigger customer_profiles_touch before update on public.customer_profiles
  for each row execute function public.touch_updated_at();

-- ── Provider profile ──────────────────────────────────────────────────────
create table if not exists public.provider_profiles (
  id                     uuid primary key references public.profiles(id) on delete cascade,
  business_name          text,
  bio                    text,
  years_experience       integer not null default 0 check (years_experience between 0 and 70),
  verification           verification_status not null default 'PENDING',
  verified_at            timestamptz,

  -- Availability state (spec §17). `MOVING` is an internal operational
  -- detail derived from location telemetry, not a separate stored state.
  state                  provider_state not null default 'OFFLINE',
  state_changed_at       timestamptz not null default now(),

  -- Trust signals used by the matching engine (spec §13).
  rating_avg             numeric(3,2) check (rating_avg is null or rating_avg between 1 and 5),
  rating_count           integer not null default 0 check (rating_count >= 0),
  completed_jobs         integer not null default 0 check (completed_jobs >= 0),
  cancelled_jobs         integer not null default 0 check (cancelled_jobs >= 0),
  offers_received        integer not null default 0 check (offers_received >= 0),
  offers_accepted        integer not null default 0 check (offers_accepted >= 0),
  -- Rolling median seconds to respond to an offer; null until observed.
  avg_response_seconds   integer check (avg_response_seconds is null or avg_response_seconds >= 0),

  -- Operational defaults
  max_radius_km          numeric(5,2) not null default 15 check (max_radius_km > 0 and max_radius_km <= 200),
  is_demo                boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

drop trigger if exists provider_profiles_touch on public.provider_profiles;
create trigger provider_profiles_touch before update on public.provider_profiles
  for each row execute function public.touch_updated_at();

create index if not exists provider_profiles_state_idx
  on public.provider_profiles(state) where state <> 'OFFLINE';
create index if not exists provider_profiles_verification_idx
  on public.provider_profiles(verification);

-- Record every provider state change so utilisation can be computed later.
create table if not exists public.provider_availability (
  id            uuid primary key default gen_random_uuid(),
  provider_id   uuid not null references public.provider_profiles(id) on delete cascade,
  state         provider_state not null,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  constraint provider_availability_window check (ended_at is null or ended_at >= started_at)
);

create index if not exists provider_availability_provider_idx
  on public.provider_availability(provider_id, started_at desc);

-- ── Provider private data ─────────────────────────────────────────────────
-- RLS is row-level, not column-level: if payout details lived on
-- provider_profiles, any policy that lets a customer read a matched
-- provider's rating would also expose their bank details. They therefore get
-- their own table with a strictly narrower policy (spec §23, §31).
create table if not exists public.provider_payout_details (
  provider_id   uuid primary key references public.provider_profiles(id) on delete cascade,
  method        text check (method in ('bank_transfer','other')),
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists provider_payout_details_touch on public.provider_payout_details;
create trigger provider_payout_details_touch before update on public.provider_payout_details
  for each row execute function public.touch_updated_at();

-- Moderation notes. Admin-only; not visible to the provider themselves.
create table if not exists public.provider_admin_notes (
  id                uuid primary key default gen_random_uuid(),
  provider_id       uuid not null references public.provider_profiles(id) on delete cascade,
  suspended_reason  text,
  note              text,
  author_id         uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists provider_admin_notes_provider_idx
  on public.provider_admin_notes(provider_id, created_at desc);

-- ── Sessions ──────────────────────────────────────────────────────────────
-- Server-side sessions. Only a SHA-256 hash of the token is stored, so a
-- database leak does not yield usable session tokens.
create table if not exists public.user_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  token_hash   text not null unique,
  user_agent   text,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  constraint user_sessions_expiry check (expires_at > created_at)
);

create index if not exists user_sessions_user_idx on public.user_sessions(user_id);
create index if not exists user_sessions_expiry_idx on public.user_sessions(expires_at);
