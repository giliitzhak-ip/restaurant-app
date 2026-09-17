-- ===========================================================================
-- 0008 — Settings, admin audit, matching telemetry
-- ===========================================================================

-- Runtime configuration: matching weights (§14), dispatch waves (§16),
-- offer timeouts, staleness thresholds. Read server-side; never compiled
-- into frontend code.
create table if not exists public.settings (
  key          text primary key,
  value        jsonb not null,
  description  text,
  updated_by   uuid references public.profiles(id) on delete set null,
  updated_at   timestamptz not null default now()
);

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- Every admin action is audited (spec §33).
create table if not exists public.admin_actions (
  id            uuid primary key default gen_random_uuid(),
  admin_id      uuid not null references public.profiles(id) on delete restrict,
  action        text not null,
  target_type   text not null,
  target_id     uuid,
  reason        text,
  before_state  jsonb,
  after_state   jsonb,
  request_id    text,
  created_at    timestamptz not null default now()
);

create index if not exists admin_actions_admin_idx on public.admin_actions(admin_id, created_at desc);
create index if not exists admin_actions_target_idx on public.admin_actions(target_type, target_id);

-- ── Matching telemetry (spec §36) ─────────────────────────────────────────
-- One row per (job, candidate provider) considered, whether or not an offer
-- was sent. This is the clean-data foundation for later intelligence (§63);
-- no ML is implemented now.
create table if not exists public.matching_events (
  id                    bigserial primary key,
  job_id                uuid not null references public.jobs(id) on delete cascade,
  provider_id           uuid not null references public.provider_profiles(id) on delete cascade,
  offer_id              uuid references public.job_offers(id) on delete set null,
  wave                  integer not null default 1,

  provider_location     geography(Point, 4326),
  customer_location     geography(Point, 4326) not null,
  provider_heading_deg  numeric(6,2),
  provider_destination  geography(Point, 4326),

  straight_distance_km  numeric(7,2),
  route_distance_km     numeric(7,2),
  route_deviation_min   numeric(7,2),
  route_deviation_km    numeric(7,2),
  eta_minutes           numeric(7,2),
  eta_confidence        text,
  is_on_the_way         boolean,

  route_opportunity_score numeric(6,2),
  skill_score             numeric(6,2),
  availability_score      numeric(6,2),
  eta_score               numeric(6,2),
  reliability_score       numeric(6,2),
  rating_score            numeric(6,2),
  price_score             numeric(6,2),
  experience_score        numeric(6,2),
  final_score             numeric(6,2),

  weights_used          jsonb not null default '{}'::jsonb,
  excluded_reason       text,

  notified_at           timestamptz,
  responded_at          timestamptz,
  response_seconds      numeric(8,2),
  accepted              boolean not null default false,
  rejected              boolean not null default false,
  expired               boolean not null default false,

  created_at            timestamptz not null default now()
);

create index if not exists matching_events_job_idx
  on public.matching_events(job_id, final_score desc);
create index if not exists matching_events_provider_idx
  on public.matching_events(provider_id, created_at desc);
