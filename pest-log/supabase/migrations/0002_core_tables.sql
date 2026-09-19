-- ─────────────────────────────────────────────────────────────────────────────
-- 0002 — טבלאות הליבה.
-- לכל טבלה: id (uuid), organization_id, created_at, updated_at, created_by,
-- updated_by, ובמקומות הרלוונטיים version ו-deleted_at (soft delete).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── organizations ────────────────────────────────────────────────────────────
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  -- לאחידות מול שאר הטבלאות ומול מדיניות ה-RLS.
  organization_id uuid generated always as (id) stored,
  name text not null check (length(btrim(name)) > 0),
  legal_name text,
  business_number text,
  phone text,
  email text,
  address text,
  -- מונה המספר הסידורי העוקב ברמת העסק (דרישה: מספר עוקב ובלתי חוזר).
  next_log_serial bigint not null default 1 check (next_log_serial >= 1),
  -- מספר המרכז להרעלות מוצג תמיד; נשמר כדי לאפשר עדכון בלי פריסה מחדש.
  poison_center_phone text not null default '04-7771900',
  retention_years integer not null default 3 check (retention_years >= 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  version integer not null default 0
);
comment on table public.organizations is 'עסקי הדברה. כל המידע במערכת משויך לארגון אחד.';

-- ── profiles ─────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id uuid not null unique,
  full_name text not null check (length(btrim(full_name)) > 0),
  email text,
  phone text,
  -- owner/manager רשאים למחוק רכות יומן שעברה תקופת השמירה שלו.
  role text not null default 'exterminator' check (role in ('owner', 'manager', 'exterminator', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  version integer not null default 0
);
create index if not exists profiles_org_idx on public.profiles (organization_id);
comment on table public.profiles is 'משתמשי המערכת ושיוכם לארגון.';

-- ── pesticide_licenses ───────────────────────────────────────────────────────
create table if not exists public.pesticide_licenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- המדביר שהרישיון שלו. profile_id ריק כאשר מדובר במדביר מסייע חיצוני.
  profile_id uuid references public.profiles (id) on delete set null,
  holder_name text not null check (length(btrim(holder_name)) > 0),
  license_type text not null check (length(btrim(license_type)) > 0),
  license_number text not null check (length(btrim(license_number)) > 0),
  mobile text,
  email text,
  address text,
  valid_from date,
  valid_until date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  version integer not null default 0,
  constraint pesticide_licenses_unique_per_org unique (organization_id, license_number, license_type)
);
create index if not exists pesticide_licenses_org_idx on public.pesticide_licenses (organization_id);
comment on table public.pesticide_licenses is 'רישיונות הדברה של המדבירים בעסק (דרישה 1, 9).';

-- ── clients ──────────────────────────────────────────────────────────────────
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  -- האם המזמין אדם פרטי — מכתיב חובת מספר נייד (דרישה 3).
  is_private_person boolean not null default false,
  phone text,
  mobile text,
  email text,
  contact_role text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  version integer not null default 0
);
create index if not exists clients_org_idx on public.clients (organization_id);
create index if not exists clients_name_idx on public.clients (organization_id, name);
comment on table public.clients is 'מזמיני הדברה (דרישה 3).';

-- ── client_sites ─────────────────────────────────────────────────────────────
create table if not exists public.client_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  label text not null check (length(btrim(label)) > 0),
  place_kind text not null check (place_kind in ('dwelling', 'open_area', 'fogging_area')),
  -- דירה / בית / מבנה
  city text,
  street text,
  house_number text,
  apartment_number text,
  structure_type text,
  -- שטח פתוח
  local_authority_name text,
  site_type text,
  site_description text,
  -- ערפול
  neighborhood_name text,
  area_description text,
  -- נ״צ
  coordinates jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  version integer not null default 0
);
create index if not exists client_sites_org_idx on public.client_sites (organization_id);
create index if not exists client_sites_client_idx on public.client_sites (client_id);
comment on table public.client_sites is 'אתרי ההדברה של כל מזמין (דרישה 4).';

-- ── products — מאגר התכשירים ─────────────────────────────────────────────────
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  trade_name text not null check (length(btrim(trade_name)) > 0),
  active_ingredient_name text not null check (length(btrim(active_ingredient_name)) > 0),
  active_ingredient_concentration_percent numeric(7, 3) not null
    check (active_ingredient_concentration_percent > 0 and active_ingredient_concentration_percent <= 100),
  ready_to_use boolean not null default false,
  registration_status text not null default 'unknown'
    check (registration_status in ('registered', 'expired', 'revoked', 'unknown')),
  registration_number text,
  label_url text,
  valid_until date,
  approved_pests text[] not null default '{}',
  approved_application_methods text[] not null default '{}',
  -- מקור המידע ותאריך האימות — חובה, כדי שלא יוצג מידע כ"עדכני" בלי אסמכתה.
  source_name text not null check (length(btrim(source_name)) > 0),
  source_url text,
  verified_at timestamptz not null,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  version integer not null default 0,
  constraint products_unique_per_org unique (organization_id, trade_name, active_ingredient_name)
);
create index if not exists products_org_idx on public.products (organization_id);
create index if not exists products_trade_name_idx on public.products (organization_id, trade_name);
comment on table public.products is 'מאגר התכשירים. כל שורה נושאת מקור מידע, תאריך אימות, סטטוס רישום ותוקף.';

-- ── pest_catalog — נספח א׳ ───────────────────────────────────────────────────
create table if not exists public.pest_catalog (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (length(btrim(code)) > 0),
  name_he text not null check (length(btrim(name_he)) > 0),
  name_scientific text,
  group_name text,
  source_name text not null check (length(btrim(source_name)) > 0),
  source_url text,
  verified_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  version integer not null default 0,
  constraint pest_catalog_unique_per_org unique (organization_id, code)
);
create index if not exists pest_catalog_org_idx on public.pest_catalog (organization_id);
comment on table public.pest_catalog is 'קטלוג המזיקים לפי נספח א׳. נטען דרך import מאומת, לא מוטבע בקוד.';

-- ── warning_templates ────────────────────────────────────────────────────────
create table if not exists public.warning_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  product_id uuid references public.products (id) on delete set null,
  treatment_nature_description text,
  risks_to_humans text,
  risks_to_animals text,
  re_entry_hours numeric(7, 2),
  additional_label_instructions text,
  during_treatment_info text,
  after_treatment_info text,
  -- אסמכתת התווית שעליה מבוססת התבנית. בלעדיה התבנית אינה ניתנת לאישור.
  label_reference text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  version integer not null default 0
);
create index if not exists warning_templates_org_idx on public.warning_templates (organization_id);
comment on table public.warning_templates is 'תבניות אזהרה. הצעה בלבד — דורשות אישור מפורש של המדביר בכל יומן.';
