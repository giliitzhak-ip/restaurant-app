-- ===========================================================================
-- 0004 — Jobs, images, offers, assignments, status history
-- ===========================================================================

create table if not exists public.jobs (
  id                    uuid primary key default gen_random_uuid(),
  customer_id           uuid not null references public.customer_profiles(id) on delete restrict,

  -- What the customer asked for, in their own words (spec §7).
  raw_description       text not null check (length(btrim(raw_description)) between 3 and 2000),

  -- Structured understanding (spec §32). Nullable because a job can be
  -- created before classification succeeds; unmatched jobs are a tracked
  -- operational metric, not an error state.
  category_id           uuid references public.categories(id) on delete restrict,
  service_id            uuid references public.services(id) on delete restrict,
  urgency               urgency_level not null default 'normal',
  understanding         jsonb not null default '{}'::jsonb,

  booking_mode          booking_mode not null default 'NOW',
  scheduled_for         timestamptz,

  status                job_status not null default 'REQUESTED',

  -- Location (spec §18). accuracy_m is retained so the matcher can refuse to
  -- treat a 3km-accurate fix as a precise one.
  location              geography(Point, 4326) not null,
  location_accuracy_m   numeric(8,2) check (location_accuracy_m is null or location_accuracy_m >= 0),
  address_text          text,
  address_notes         text,

  -- Money. Authoritative amounts, set server-side only (spec §27, §45).
  quoted_price_ils      numeric(10,2) check (quoted_price_ils is null or quoted_price_ils >= 0),
  final_price_ils       numeric(10,2) check (final_price_ils is null or final_price_ils >= 0),

  -- Dispatch bookkeeping (spec §16).
  dispatch_wave         integer not null default 0 check (dispatch_wave >= 0),
  dispatch_radius_km    numeric(6,2),
  search_started_at     timestamptz,
  matched_at            timestamptz,

  cancellation_reason   text,
  cancelled_by          uuid references public.profiles(id) on delete set null,

  is_demo               boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint jobs_schedule_requires_time check (
    booking_mode <> 'SCHEDULE' or scheduled_for is not null
  )
);

drop trigger if exists jobs_touch on public.jobs;
create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_updated_at();

create index if not exists jobs_customer_idx  on public.jobs(customer_id, created_at desc);
create index if not exists jobs_status_idx    on public.jobs(status);
create index if not exists jobs_location_gix  on public.jobs using gist (location);
create index if not exists jobs_category_idx  on public.jobs(category_id);
-- Partial index for the admin control tower's "live" queries (spec §33).
create index if not exists jobs_active_idx on public.jobs(status, created_at desc)
  where status in ('REQUESTED','SEARCHING','OFFERS_AVAILABLE','PROVIDER_SELECTED',
                   'CONFIRMED','EN_ROUTE','ARRIVED','IN_PROGRESS',
                   'AWAITING_CUSTOMER_CONFIRMATION');

-- ── Job images ────────────────────────────────────────────────────────────
create table if not exists public.job_images (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references public.jobs(id) on delete cascade,
  uploaded_by   uuid not null references public.profiles(id) on delete set null,
  storage_path  text not null,
  kind          text not null default 'problem'
                  check (kind in ('problem','before','after','receipt')),
  content_type  text,
  size_bytes    bigint check (size_bytes is null or size_bytes >= 0),
  created_at    timestamptz not null default now()
);

create index if not exists job_images_job_idx on public.job_images(job_id);

-- ── Offers ────────────────────────────────────────────────────────────────
-- One row per provider notified about a job. Carries the full score
-- breakdown so the matching debugger (spec §34) reads real data.
create table if not exists public.job_offers (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid not null references public.jobs(id) on delete cascade,
  provider_id         uuid not null references public.provider_profiles(id) on delete cascade,
  wave                integer not null default 1 check (wave >= 1),
  status              offer_status not null default 'PENDING',

  -- Offer terms, computed server-side at dispatch time.
  price_ils           numeric(10,2) not null check (price_ils >= 0),
  eta_minutes         integer check (eta_minutes is null or eta_minutes >= 0),
  eta_confidence      text not null default 'estimated'
                        check (eta_confidence in ('routed','estimated','unavailable')),
  distance_km         numeric(7,2) check (distance_km is null or distance_km >= 0),
  is_on_the_way       boolean not null default false,

  -- Score breakdown (spec §34, §36).
  final_score         numeric(6,2) not null default 0,
  score_breakdown     jsonb not null default '{}'::jsonb,

  notified_at         timestamptz not null default now(),
  expires_at          timestamptz not null,
  responded_at        timestamptz,
  decline_reason      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (job_id, provider_id),
  constraint job_offers_expiry check (expires_at > notified_at)
);

drop trigger if exists job_offers_touch on public.job_offers;
create trigger job_offers_touch before update on public.job_offers
  for each row execute function public.touch_updated_at();

create index if not exists job_offers_provider_pending_idx
  on public.job_offers(provider_id, status, expires_at)
  where status = 'PENDING';
create index if not exists job_offers_job_idx on public.job_offers(job_id, final_score desc);

-- ── Assignment ────────────────────────────────────────────────────────────
-- The UNIQUE constraint on job_id is the hard guarantee that a job can never
-- be assigned twice, regardless of application bugs or concurrency (spec §25).
create table if not exists public.job_assignments (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null unique references public.jobs(id) on delete cascade,
  provider_id   uuid not null references public.provider_profiles(id) on delete restrict,
  offer_id      uuid not null unique references public.job_offers(id) on delete restrict,
  price_ils     numeric(10,2) not null check (price_ils >= 0),
  eta_minutes   integer,
  assigned_at   timestamptz not null default now(),
  en_route_at   timestamptz,
  arrived_at    timestamptz,
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists job_assignments_provider_idx
  on public.job_assignments(provider_id, assigned_at desc);

-- ── Status history (spec §26) ─────────────────────────────────────────────
create table if not exists public.job_status_history (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references public.jobs(id) on delete cascade,
  from_status   job_status,
  to_status     job_status not null,
  actor_id      uuid references public.profiles(id) on delete set null,
  actor_role    text,
  reason        text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists job_status_history_job_idx
  on public.job_status_history(job_id, created_at);
