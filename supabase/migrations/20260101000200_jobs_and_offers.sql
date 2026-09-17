-- ============================================================================
-- GET SERVICE — 0003  Jobs, offers, assignments, chat
-- ============================================================================

create table if not exists public.jobs (
  id                  uuid primary key default gen_random_uuid(),
  reference           text not null unique default ('GS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  customer_id         uuid not null references public.users (id) on delete cascade,
  category_id         uuid not null references public.categories (id) on delete restrict,
  service_id          uuid references public.services (id) on delete set null,
  title               text not null,
  description         text not null,
  status              public.job_status not null default 'requested',
  urgency             public.job_urgency not null default 'today',
  scheduled_for       timestamptz,
  address             text not null,
  address_notes       text,
  lat                 double precision not null,
  lng                 double precision not null,
  location            extensions.geography(Point, 4326)
                      generated always as (
                        extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography
                      ) stored,
  budget_min          numeric(10, 2) check (budget_min is null or budget_min >= 0),
  budget_max          numeric(10, 2) check (budget_max is null or budget_max >= 0),
  search_radius_km    numeric(6, 2) not null default 5,
  broadcast_at        timestamptz,
  assigned_provider_id uuid references public.provider_profiles (id) on delete set null,
  accepted_offer_id   uuid,
  final_price         numeric(10, 2),
  platform_fee        numeric(10, 2),
  provider_payout     numeric(10, 2),
  cancelled_by        public.actor_type,
  cancellation_reason text,
  cancelled_at        timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint jobs_budget_range check (budget_min is null or budget_max is null or budget_max >= budget_min),
  constraint jobs_scheduled_requires_date check (urgency <> 'scheduled' or scheduled_for is not null)
);
comment on column public.jobs.search_radius_km is
  'Current broadcast radius. The discovery job widens it 5 -> 10 -> 20 km while searching.';

create table if not exists public.job_images (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references public.jobs (id) on delete cascade,
  storage_path  text not null,
  kind          public.media_kind not null default 'image',
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.job_offers (
  id                 uuid primary key default gen_random_uuid(),
  job_id             uuid not null references public.jobs (id) on delete cascade,
  provider_id        uuid not null references public.provider_profiles (id) on delete cascade,
  price              numeric(10, 2) not null check (price > 0),
  eta_minutes        integer not null check (eta_minutes > 0 and eta_minutes <= 10080),
  note               text,
  status             public.offer_status not null default 'pending',
  valid_until        timestamptz not null default (now() + interval '2 hours'),
  distance_km        numeric(8, 2),
  match_score        numeric(6, 2),
  responded_in_seconds integer,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (job_id, provider_id)
);

alter table public.jobs
  drop constraint if exists jobs_accepted_offer_fk;
alter table public.jobs
  add constraint jobs_accepted_offer_fk
  foreign key (accepted_offer_id) references public.job_offers (id) on delete set null;

-- Which providers a job was broadcast to, and what they did with it.
create table if not exists public.job_assignments (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references public.jobs (id) on delete cascade,
  provider_id     uuid not null references public.provider_profiles (id) on delete cascade,
  match_score     numeric(6, 2) not null default 0,
  distance_km     numeric(8, 2),
  score_breakdown jsonb not null default '{}'::jsonb,
  notified_at     timestamptz,
  viewed_at       timestamptz,
  declined_at     timestamptz,
  decline_reason  text,
  created_at      timestamptz not null default now(),
  unique (job_id, provider_id)
);
comment on table public.job_assignments is
  'The shortlist produced by the match engine. Also the RLS gate: a provider sees a job only if it was broadcast to them.';

create table if not exists public.job_status_history (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs (id) on delete cascade,
  from_status  public.job_status,
  to_status    public.job_status not null,
  actor_id     uuid references public.users (id) on delete set null,
  actor_type   public.actor_type not null default 'system',
  note         text,
  created_at   timestamptz not null default now()
);

create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references public.jobs (id) on delete cascade,
  sender_id     uuid not null references public.users (id) on delete cascade,
  body          text,
  message_type  public.message_type not null default 'text',
  storage_path  text,
  read_at       timestamptz,
  created_at    timestamptz not null default now(),
  constraint messages_payload_present check (
    (message_type = 'image' and storage_path is not null)
    or (message_type <> 'image' and body is not null and length(btrim(body)) > 0)
  )
);

create table if not exists public.favorites (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.users (id) on delete cascade,
  provider_id   uuid not null references public.provider_profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (customer_id, provider_id)
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists idx_jobs_status          on public.jobs (status);
create index if not exists idx_jobs_category        on public.jobs (category_id);
create index if not exists idx_jobs_created_at      on public.jobs (created_at desc);
create index if not exists idx_jobs_customer        on public.jobs (customer_id, created_at desc);
create index if not exists idx_jobs_provider        on public.jobs (assigned_provider_id, created_at desc);
create index if not exists idx_jobs_location        on public.jobs using gist (location);
create index if not exists idx_jobs_open_search     on public.jobs (status, created_at desc)
  where status in ('requested', 'searching', 'offers_received');
create index if not exists idx_job_images_job       on public.job_images (job_id);
create index if not exists idx_job_offers_job       on public.job_offers (job_id, status);
create index if not exists idx_job_offers_provider  on public.job_offers (provider_id, created_at desc);
create index if not exists idx_job_assignments_job  on public.job_assignments (job_id, match_score desc);
create index if not exists idx_job_assignments_prov on public.job_assignments (provider_id, created_at desc);
create index if not exists idx_job_status_history   on public.job_status_history (job_id, created_at);
create index if not exists idx_messages_job         on public.messages (job_id, created_at);
create index if not exists idx_favorites_customer   on public.favorites (customer_id);

do $$
declare t text;
begin
  foreach t in array array['jobs', 'job_offers'] loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I;
       create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at();', t, t);
  end loop;
end $$;
