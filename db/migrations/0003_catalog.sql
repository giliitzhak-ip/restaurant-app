-- ===========================================================================
-- 0003 — Service catalog: categories, services, provider capabilities, areas
--
-- Category behaviour is DATA, not code (spec §5). Adding a category is an
-- INSERT; no application branch needs to change.
-- ===========================================================================

create table if not exists public.categories (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique check (slug ~ '^[a-z][a-z0-9_]{1,40}$'),
  name_he               text not null,
  name_en               text not null,
  icon                  text,
  sort_order            integer not null default 100,
  is_active             boolean not null default true,

  -- ── Behaviour configuration (spec §5) ─────────────────────────────────
  pricing_model         price_model not null default 'FIXED_PRICE',
  supports_now          boolean not null default true,
  supports_schedule     boolean not null default true,
  supports_compare      boolean not null default false,
  requires_license      boolean not null default false,
  requires_insurance    boolean not null default false,
  requires_documents    boolean not null default false,
  requires_before_after boolean not null default false,
  default_duration_min  integer not null default 60 check (default_duration_min between 5 and 1440),
  default_radius_km     numeric(5,2) not null default 10 check (default_radius_km > 0),
  required_skills       text[] not null default '{}',

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

drop trigger if exists categories_touch on public.categories;
create trigger categories_touch before update on public.categories
  for each row execute function public.touch_updated_at();

-- A concrete job type inside a category ("sink_leak", "ac_not_cooling").
create table if not exists public.services (
  id                  uuid primary key default gen_random_uuid(),
  category_id         uuid not null references public.categories(id) on delete cascade,
  slug                text not null check (slug ~ '^[a-z][a-z0-9_]{1,60}$'),
  name_he             text not null,
  name_en             text not null,
  -- Guide price shown to the customer before dispatch; the authoritative
  -- price always comes from the accepted offer (spec §27, §45).
  base_price_ils      numeric(10,2) check (base_price_ils is null or base_price_ils >= 0),
  min_price_ils       numeric(10,2) check (min_price_ils is null or min_price_ils >= 0),
  max_price_ils       numeric(10,2) check (max_price_ils is null or max_price_ils >= 0),
  duration_min        integer check (duration_min is null or duration_min between 5 and 1440),
  default_urgency     urgency_level not null default 'normal',
  required_skills     text[] not null default '{}',
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (category_id, slug),
  constraint services_price_band check (
    min_price_ils is null or max_price_ils is null or max_price_ils >= min_price_ils
  )
);

drop trigger if exists services_touch on public.services;
create trigger services_touch before update on public.services
  for each row execute function public.touch_updated_at();

create index if not exists services_category_idx on public.services(category_id) where is_active;

-- ── Provider capabilities ─────────────────────────────────────────────────
create table if not exists public.provider_categories (
  provider_id   uuid not null references public.provider_profiles(id) on delete cascade,
  category_id   uuid not null references public.categories(id) on delete cascade,
  skills        text[] not null default '{}',
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now(),
  primary key (provider_id, category_id)
);

create index if not exists provider_categories_category_idx
  on public.provider_categories(category_id);

create table if not exists public.provider_services (
  provider_id     uuid not null references public.provider_profiles(id) on delete cascade,
  service_id      uuid not null references public.services(id) on delete cascade,
  -- Provider's own price for this service. Server-side source of truth for
  -- the quoted amount (spec §45: never trust a frontend price).
  price_ils       numeric(10,2) check (price_ils is null or price_ils >= 0),
  duration_min    integer check (duration_min is null or duration_min between 5 and 1440),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (provider_id, service_id)
);

drop trigger if exists provider_services_touch on public.provider_services;
create trigger provider_services_touch before update on public.provider_services
  for each row execute function public.touch_updated_at();

create index if not exists provider_services_service_idx
  on public.provider_services(service_id) where is_active;

-- ── Service areas ─────────────────────────────────────────────────────────
-- Where a provider is willing to work, independent of where they are now.
create table if not exists public.service_areas (
  id            uuid primary key default gen_random_uuid(),
  provider_id   uuid not null references public.provider_profiles(id) on delete cascade,
  label         text,
  center        geography(Point, 4326) not null,
  radius_km     numeric(6,2) not null check (radius_km > 0 and radius_km <= 200),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists service_areas_provider_idx on public.service_areas(provider_id);
create index if not exists service_areas_center_gix on public.service_areas using gist (center);
