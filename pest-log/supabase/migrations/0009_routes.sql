-- ─────────────────────────────────────────────────────────────────────────────
-- 0009 — מסלול עבודה: קווי אחזקה קבועים, מסלולים יומיים, ביקורים ודגשים.
--
-- הפיצ'ר נוסף לצד יומן ההדברה ואינו משנה אף טבלה קיימת. הקישור ליומן
-- הוא עמודה אחת בלבד (route_visits.linked_pest_log_id) ואינו נוגע
-- בנעילת היומן שהושלם.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── route_templates — קו אחזקה חוזר ─────────────────────────────────────────
create table if not exists public.route_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  route_kind text not null default 'maintenance_line'
    check (route_kind in ('daily', 'weekly', 'maintenance_line', 'one_off', 'team', 'area')),
  area_name text,
  -- 0=ראשון … 6=שבת. ריק במסלול שאינו קשור ליום קבוע.
  weekday smallint check (weekday between 0 and 6),
  default_start_time time,
  default_team_name text,
  default_vehicle text,
  default_assignee_id uuid references public.profiles (id) on delete set null,
  start_point_address text,
  start_point_coordinates jsonb,
  -- תחנות התבנית: מערך של {clientId, clientSiteId, position, serviceType,
  -- frequencyDays, estimatedDurationMinutes, timeWindowStart, timeWindowEnd,
  -- standingFocus[]}. נשמר כ-jsonb כדי לא להוסיף טבלה שביעית מעבר למבוקש.
  stops jsonb not null default '[]'::jsonb,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  version integer not null default 0,
  constraint route_templates_stops_is_array check (jsonb_typeof(stops) = 'array')
);
create index if not exists route_templates_org_idx on public.route_templates (organization_id);
comment on table public.route_templates is 'קווי אחזקה חוזרים: רשימת לקוחות קבועה, סדר, תדירות ודגשים קבועים.';

-- ── maintenance_routes — מסלול עבודה אחד ────────────────────────────────────
create table if not exists public.maintenance_routes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  template_id uuid references public.route_templates (id) on delete set null,
  name text not null check (length(btrim(name)) > 0),
  route_kind text not null default 'daily'
    check (route_kind in ('daily', 'weekly', 'maintenance_line', 'one_off', 'team', 'area')),
  area_name text,
  route_date date not null,
  start_time time,
  assigned_user_id uuid references public.profiles (id) on delete set null,
  team_name text,
  vehicle text,
  start_point_address text,
  start_point_coordinates jsonb,
  notes text,
  status text not null default 'planned'
    check (status in ('planned', 'active', 'completed', 'cancelled')),
  -- סדר נעול לאחר אישור. פתיחה מחדש — מנהל בלבד.
  order_locked boolean not null default false,
  order_locked_at timestamptz,
  order_locked_by uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  version integer not null default 0
);
create index if not exists maintenance_routes_org_date_idx
  on public.maintenance_routes (organization_id, route_date desc);
create index if not exists maintenance_routes_assignee_idx
  on public.maintenance_routes (assigned_user_id, route_date desc);
comment on table public.maintenance_routes is 'מסלול עבודה: יומי, שבועי, קו אחזקה, חד-פעמי, לפי צוות או לפי אזור.';

-- ── route_assignments — שיוך עובדים למסלול ──────────────────────────────────
create table if not exists public.route_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  route_id uuid not null references public.maintenance_routes (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  assignment_role text not null default 'lead' check (assignment_role in ('lead', 'assistant', 'observer')),
  vehicle text,
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  version integer not null default 0,
  constraint route_assignments_unique unique (route_id, profile_id)
);
create index if not exists route_assignments_route_idx on public.route_assignments (route_id);
create index if not exists route_assignments_profile_idx on public.route_assignments (profile_id);
comment on table public.route_assignments is 'מי מוקצה לכל מסלול. עובד רואה רק מסלולים שהוקצו לו.';

-- ── route_visits — תחנה אחת במסלול ──────────────────────────────────────────
create table if not exists public.route_visits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  route_id uuid not null references public.maintenance_routes (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete restrict,
  client_site_id uuid references public.client_sites (id) on delete restrict,
  position integer not null check (position >= 1),
  planned_date date not null,
  planned_start_time time,
  time_window_start time,
  time_window_end time,
  estimated_duration_minutes integer check (estimated_duration_minutes between 1 and 600),
  service_type text,
  frequency_days integer check (frequency_days between 1 and 3650),
  priority text not null default 'normal' check (priority in ('normal', 'high', 'urgent')),
  status text not null default 'pending' check (status in (
    'pending', 'en_route', 'in_progress', 'completed', 'revisit_needed',
    'waiting_client', 'postponed', 'cancelled'
  )),
  assigned_user_id uuid references public.profiles (id) on delete set null,
  assigned_vehicle_id text,
  arrival_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  -- מיקום בעת ההגעה/הסיום. נכתב רק לאחר הרשאת המשתמש במכשיר.
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  linked_pest_log_id uuid references public.pest_logs (id) on delete set null,
  completion_notes text,
  follow_up_required boolean not null default false,
  postponed_to_date date,
  postpone_reason text,
  -- הערות פנימיות לצוות. אינן מוצגות ללקוח ואינן נכנסות ל-PDF של היומן.
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  version integer not null default 0,
  constraint route_visits_time_window check (
    time_window_start is null or time_window_end is null or time_window_end > time_window_start
  )
);
create index if not exists route_visits_route_idx on public.route_visits (route_id, position);
create index if not exists route_visits_org_date_idx on public.route_visits (organization_id, planned_date);
create index if not exists route_visits_client_idx on public.route_visits (client_id, planned_date desc);
-- מניעת ביקור כפול לאותו אתר באותו מסלול ובאותו יום.
create unique index if not exists route_visits_no_duplicate_stop
  on public.route_visits (route_id, client_id, coalesce(client_site_id, '00000000-0000-0000-0000-000000000000'::uuid), planned_date)
  where deleted_at is null and status <> 'cancelled';
comment on table public.route_visits is 'תחנה במסלול: לקוח, אתר, סדר, חלון זמן, סטטוס וקישור ליומן ההדברה.';

-- ── visit_focus_items — דגשים לביקור הנוכחי ─────────────────────────────────
create table if not exists public.visit_focus_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  visit_id uuid not null references public.route_visits (id) on delete cascade,
  category text not null default 'note' check (category in (
    'pest', 'hotspot', 'bait_station', 'previous_defect', 'prevention',
    'complaint', 'photo', 'equipment', 'access', 'hours', 'sensitivity', 'note'
  )),
  title text not null check (length(btrim(title)) > 0),
  details text,
  site_location text,
  importance text not null default 'normal' check (importance in ('low', 'normal', 'high')),
  status text not null default 'to_check'
    check (status in ('to_check', 'in_progress', 'done', 'not_found', 'needs_revisit')),
  -- מקור הדגש. הצעה אוטומטית אינה נחשבת מאושרת עד שהמדביר מאשר אותה.
  source text not null default 'manual' check (source in ('manual', 'auto_suggested', 'template')),
  source_reference jsonb not null default '{}'::jsonb,
  approved boolean not null default true,
  approved_at timestamptz,
  approved_by uuid,
  assignee_id uuid references public.profiles (id) on delete set null,
  due_date date,
  -- דגש פנימי לצוות: לא מוצג ללקוח ולא ב-PDF.
  is_internal boolean not null default false,
  attachment_id uuid references public.attachments (id) on delete set null,
  position integer not null default 1 check (position >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  version integer not null default 0
);
create index if not exists visit_focus_items_visit_idx on public.visit_focus_items (visit_id, position);
comment on table public.visit_focus_items is 'דגשים לביקור: מה לבדוק, ליקויים קודמים, רגישויות והערות פנימיות.';

-- ── visit_status_history — היסטוריית סטטוס וסדר ─────────────────────────────
create table if not exists public.visit_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  route_id uuid not null references public.maintenance_routes (id) on delete cascade,
  -- set null ולא cascade: הסרת ביקור מהמסלול אינה מוחקת את ההיסטוריה שלו.
  visit_id uuid references public.route_visits (id) on delete set null,
  action text not null default 'status_change'
    check (action in ('status_change', 'reorder', 'added', 'removed', 'postponed', 'priority_change')),
  from_status text,
  to_status text,
  from_position integer,
  to_position integer,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
create index if not exists visit_status_history_visit_idx on public.visit_status_history (visit_id, changed_at desc);
create index if not exists visit_status_history_route_idx on public.visit_status_history (route_id, changed_at desc);
comment on table public.visit_status_history is 'היסטוריית סטטוס וסדר של ביקורים. append-only.';
