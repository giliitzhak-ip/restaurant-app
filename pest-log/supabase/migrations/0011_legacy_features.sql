-- ─────────────────────────────────────────────────────────────────────────────
-- 0011 — פונקציות שהועברו מהגרסה המקומית הקודמת של היומן:
--   * text_templates — ספריות הניסוח של המדביר (והתבניות שהוא שומר בעצמו)
--   * site_stations  — מאגר תחנות ההאכלה והניטור של כל אתר
--   * שדות שנוספו ליומן: פירוט מזיק (נספח א׳), סיווג תמונה, אחריות
-- הטבלאות הקיימות לא שונו, למעט הוספת עמודות לא-חובה.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── text_templates ──────────────────────────────────────────────────────────
create table if not exists public.text_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in (
    'finding_signs', 'circumstances', 'prevention',
    'nature_before', 'nature_after', 'warnings', 'warranty'
  )),
  body text not null check (length(btrim(body)) between 4 and 4000),
  -- 'saved' = המדביר שמר במפורש, 'learned' = נלמד מיומן שהושלם.
  source text not null default 'saved' check (source in ('saved', 'learned')),
  use_count integer not null default 0 check (use_count >= 0),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  version integer not null default 0
);
create unique index if not exists text_templates_unique_body
  on public.text_templates (organization_id, kind, md5(body))
  where deleted_at is null;
create index if not exists text_templates_kind_idx on public.text_templates (organization_id, kind);
comment on table public.text_templates is
  'ספריות ניסוח של העסק. הצעות ניסוח בלבד — אינן מחליפות את תווית התכשיר.';

-- ── site_stations ───────────────────────────────────────────────────────────
create table if not exists public.site_stations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_site_id uuid references public.client_sites (id) on delete cascade,
  /* אתר שאינו רשום כ-client_site מזוהה לפי מפתח טקסטואלי (לקוח + מקום),
     בדיוק כפי שהיה בגרסה הקודמת. */
  site_key text,
  station_number integer not null check (station_number >= 1),
  station_type text not null default 'bait_poison' check (station_type in (
    'bait_poison', 'bait_monitor', 'glue_trap', 'insect_monitor', 'moth_trap', 'fly_trap', 'other'
  )),
  label text,
  location_description text,
  coordinates jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  version integer not null default 0,
  constraint site_stations_has_site check (client_site_id is not null or length(btrim(coalesce(site_key, ''))) > 0)
);
create index if not exists site_stations_site_idx on public.site_stations (organization_id, client_site_id);
create index if not exists site_stations_key_idx on public.site_stations (organization_id, site_key);
comment on table public.site_stations is
  'מאגר תחנות ההאכלה והניטור לכל אתר. התחנה קיימת בין ביקורים; מצבה נרשם בכל יומן.';

-- ── עמודות שנוספו לטבלאות קיימות ────────────────────────────────────────────
alter table public.pest_findings add column if not exists pest_subtype text;
alter table public.bait_stations add column if not exists station_type text;
alter table public.bait_stations add column if not exists site_station_id uuid references public.site_stations (id) on delete set null;
alter table public.attachments add column if not exists photo_kind text
  check (photo_kind is null or photo_kind in ('hazard', 'prevention', 'general'));

-- ── טריגרים ─────────────────────────────────────────────────────────────────
do $$
declare
  t text;
  tables text[] := array['text_templates', 'site_stations'];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists trg_%1$s_touch on public.%1$I', t);
    execute format('create trigger trg_%1$s_touch before update on public.%1$I
                    for each row execute function app.touch_row()', t);
    execute format('drop trigger if exists trg_%1$s_created_by on public.%1$I', t);
    execute format('create trigger trg_%1$s_created_by before insert on public.%1$I
                    for each row execute function app.stamp_created_by()', t);
    execute format('drop trigger if exists trg_%1$s_version on public.%1$I', t);
    execute format('create trigger trg_%1$s_version before update on public.%1$I
                    for each row execute function app.bump_version()', t);
  end loop;
end $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
  tables text[] := array['text_templates', 'site_stations'];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);

    execute format('drop policy if exists %1$s_select on public.%1$I', t);
    execute format('create policy %1$s_select on public.%1$I for select to authenticated
                    using (organization_id = app.current_org_id() and deleted_at is null)', t);

    execute format('drop policy if exists %1$s_insert on public.%1$I', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated
                    with check (organization_id = app.current_org_id())', t);

    execute format('drop policy if exists %1$s_update on public.%1$I', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated
                    using (organization_id = app.current_org_id())
                    with check (organization_id = app.current_org_id())', t);

    execute format('drop policy if exists %1$s_delete on public.%1$I', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated
                    using (organization_id = app.current_org_id())', t);
  end loop;
end $$;
