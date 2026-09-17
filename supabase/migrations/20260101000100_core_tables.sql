-- ============================================================================
-- GET SERVICE — 0002  Identity, taxonomy and provider tables
-- ============================================================================

-- ── Users & profiles ────────────────────────────────────────────────────────
create table if not exists public.users (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           text unique,
  phone           text unique,
  role            public.user_role   not null default 'customer',
  status          public.account_status not null default 'active',
  status_reason   text,
  last_seen_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.users is 'Application-level identity mirror of auth.users; owns role + account status.';

create table if not exists public.profiles (
  user_id      uuid primary key references public.users (id) on delete cascade,
  full_name    text not null default '',
  avatar_url   text,
  locale       text not null default 'he',
  phone        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.customer_profiles (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references public.users (id) on delete cascade,
  default_address   text,
  default_lat       double precision,
  default_lng       double precision,
  notes             text,
  jobs_created      integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── Taxonomy ────────────────────────────────────────────────────────────────
create table if not exists public.categories (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  name_en      text,
  icon         text not null default 'wrench',
  description  text,
  sort_order   integer not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.services (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.categories (id) on delete cascade,
  slug         text not null,
  name         text not null,
  name_en      text,
  description  text,
  base_price   numeric(10, 2),
  sort_order   integer not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (category_id, slug)
);

-- ── Providers ───────────────────────────────────────────────────────────────
create table if not exists public.provider_profiles (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null unique references public.users (id) on delete cascade,
  business_name          text not null,
  owner_name             text not null,
  phone                  text not null,
  email                  text,
  avatar_url             text,
  logo_url               text,
  bio                    text,
  years_experience       integer not null default 0 check (years_experience >= 0),
  base_price             numeric(10, 2),
  status                 public.provider_status not null default 'pending',
  status_reason          text,
  rating_avg             numeric(3, 2) not null default 0 check (rating_avg >= 0 and rating_avg <= 5),
  rating_count           integer not null default 0,
  completed_jobs         integer not null default 0,
  cancelled_jobs         integer not null default 0,
  avg_response_seconds   integer,
  onboarding_step        integer not null default 0,
  onboarding_completed   boolean not null default false,
  terms_accepted_at      timestamptz,
  verified_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
comment on column public.provider_profiles.avg_response_seconds is
  'Rolling average seconds between job broadcast and first offer; feeds the match engine.';

create table if not exists public.provider_categories (
  id            uuid primary key default gen_random_uuid(),
  provider_id   uuid not null references public.provider_profiles (id) on delete cascade,
  category_id   uuid not null references public.categories (id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (provider_id, category_id)
);

create table if not exists public.provider_services (
  id            uuid primary key default gen_random_uuid(),
  provider_id   uuid not null references public.provider_profiles (id) on delete cascade,
  service_id    uuid not null references public.services (id) on delete cascade,
  price_from    numeric(10, 2),
  created_at    timestamptz not null default now(),
  unique (provider_id, service_id)
);

create table if not exists public.service_areas (
  id            uuid primary key default gen_random_uuid(),
  provider_id   uuid not null references public.provider_profiles (id) on delete cascade,
  label         text not null,
  center_lat    double precision not null,
  center_lng    double precision not null,
  radius_km     numeric(6, 2) not null default 15 check (radius_km > 0 and radius_km <= 300),
  center        extensions.geography(Point, 4326)
                generated always as (
                  extensions.st_setsrid(extensions.st_makepoint(center_lng, center_lat), 4326)::extensions.geography
                ) stored,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.provider_availability (
  provider_id       uuid primary key references public.provider_profiles (id) on delete cascade,
  is_available      boolean not null default false,
  available_until   timestamptz,
  weekly_schedule   jsonb not null default '[]'::jsonb,
  updated_at        timestamptz not null default now()
);
comment on column public.provider_availability.weekly_schedule is
  'Array of {weekday:0-6, from:"HH:MM", to:"HH:MM"} used as a soft availability signal.';

create table if not exists public.provider_locations (
  provider_id   uuid primary key references public.provider_profiles (id) on delete cascade,
  lat           double precision not null,
  lng           double precision not null,
  accuracy_m    numeric(8, 2),
  heading       numeric(6, 2),
  coordinates   extensions.geography(Point, 4326)
                generated always as (
                  extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography
                ) stored,
  updated_at    timestamptz not null default now()
);
comment on table public.provider_locations is
  'Last known provider position. Only written while the provider is available or en route.';

create table if not exists public.provider_documents (
  id             uuid primary key default gen_random_uuid(),
  provider_id    uuid not null references public.provider_profiles (id) on delete cascade,
  doc_type       public.document_type not null,
  storage_path   text not null,
  file_name      text,
  status         public.document_status not null default 'pending',
  review_note    text,
  reviewed_by    uuid references public.users (id) on delete set null,
  reviewed_at    timestamptz,
  expires_at     date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.provider_documents is
  'Sensitive. Files live in the private `provider-documents` storage bucket.';

create table if not exists public.provider_gallery (
  id             uuid primary key default gen_random_uuid(),
  provider_id    uuid not null references public.provider_profiles (id) on delete cascade,
  storage_path   text not null,
  caption        text,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists idx_users_role              on public.users (role);
create index if not exists idx_users_status            on public.users (status);
create index if not exists idx_categories_active_sort  on public.categories (active, sort_order);
create index if not exists idx_services_category       on public.services (category_id, active);
create index if not exists idx_provider_profiles_status on public.provider_profiles (status);
create index if not exists idx_provider_profiles_rating on public.provider_profiles (rating_avg desc);
create index if not exists idx_provider_categories_cat on public.provider_categories (category_id);
create index if not exists idx_provider_services_svc   on public.provider_services (service_id);
create index if not exists idx_service_areas_provider  on public.service_areas (provider_id);
create index if not exists idx_service_areas_center    on public.service_areas using gist (center);
create index if not exists idx_provider_availability_flag
  on public.provider_availability (is_available) where is_available;
create index if not exists idx_provider_locations_coords
  on public.provider_locations using gist (coordinates);
create index if not exists idx_provider_locations_updated on public.provider_locations (updated_at desc);
create index if not exists idx_provider_documents_provider on public.provider_documents (provider_id, status);

-- ── updated_at triggers ─────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'users', 'profiles', 'customer_profiles', 'categories', 'services',
    'provider_profiles', 'service_areas', 'provider_availability',
    'provider_locations', 'provider_documents'
  ] loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I;
       create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at();', t, t);
  end loop;
end $$;
