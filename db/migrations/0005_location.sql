-- ===========================================================================
-- 0005 — Location intelligence (spec §18)
--
-- `provider_locations` holds the CURRENT fix, one row per provider, upserted.
-- Matching reads it with an explicit staleness filter so a stale fix is never
-- treated as live. Append-only history lives in provider_location_history and
-- feeds the future data moat (spec §63) without slowing the hot path.
-- ===========================================================================

create table if not exists public.provider_locations (
  provider_id     uuid primary key references public.provider_profiles(id) on delete cascade,
  location        geography(Point, 4326) not null,
  -- Direction of travel in degrees clockwise from true north. NULL when the
  -- device cannot supply it — the matcher must handle that, never invent it.
  heading_deg     numeric(6,2) check (heading_deg is null or (heading_deg >= 0 and heading_deg < 360)),
  speed_kmh       numeric(6,2) check (speed_kmh is null or speed_kmh >= 0),
  accuracy_m      numeric(8,2) check (accuracy_m is null or accuracy_m >= 0),
  -- Where the provider is currently headed, when known (e.g. the customer of
  -- an in-flight job). Drives route-opportunity scoring.
  destination     geography(Point, 4326),
  destination_job_id uuid references public.jobs(id) on delete set null,
  recorded_at     timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists provider_locations_touch on public.provider_locations;
create trigger provider_locations_touch before update on public.provider_locations
  for each row execute function public.touch_updated_at();

create index if not exists provider_locations_gix
  on public.provider_locations using gist (location);
create index if not exists provider_locations_recorded_idx
  on public.provider_locations(recorded_at desc);

create table if not exists public.provider_location_history (
  id            bigserial primary key,
  provider_id   uuid not null references public.provider_profiles(id) on delete cascade,
  job_id        uuid references public.jobs(id) on delete set null,
  location      geography(Point, 4326) not null,
  heading_deg   numeric(6,2),
  speed_kmh     numeric(6,2),
  accuracy_m    numeric(8,2),
  recorded_at   timestamptz not null default now()
);

create index if not exists provider_location_history_provider_idx
  on public.provider_location_history(provider_id, recorded_at desc);
create index if not exists provider_location_history_job_idx
  on public.provider_location_history(job_id, recorded_at)
  where job_id is not null;
