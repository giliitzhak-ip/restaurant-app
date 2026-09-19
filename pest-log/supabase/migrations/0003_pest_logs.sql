-- ─────────────────────────────────────────────────────────────────────────────
-- 0003 — יומני ההדברה והטבלאות הנלוות.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.pest_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,

  -- מספר סידורי עוקב ובלתי חוזר ברמת העסק. מוקצה רק בהשלמה.
  serial_number bigint,

  status text not null default 'draft' check (status in ('draft', 'completed', 'cancelled')),

  -- תוכן ניתן לעריכה כל עוד היומן טיוטה.
  content jsonb not null default '{}'::jsonb,
  -- תמונת מצב בלתי משתנה של היומן בעת ההשלמה. זה המסמך הקובע.
  snapshot jsonb,

  -- גרסת מסמך: 1 למקור, +1 לכל גרסת תיקון.
  document_version integer not null default 1 check (document_version >= 1),
  -- hash של המסמך הסופי (SHA-256 של ה-snapshot הקנוני).
  document_hash text check (document_hash ~ '^[0-9a-f]{64}$'),

  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,

  -- שרשרת תיקונים: גרסת תיקון מצביעה על היומן המקורי.
  corrects_log_id uuid references public.pest_logs (id) on delete restrict,
  correction_reason text,
  -- היומן המקורי בשרשרת (לשליפה נוחה של כל הגרסאות).
  root_log_id uuid references public.pest_logs (id) on delete restrict,

  -- מניעת כפילויות בסנכרון ובהשלמה.
  client_idempotency_key text,
  completion_idempotency_key text,

  -- לקוח/אתר מקושרים (רשות — הפרטים המחייבים נשמרים בתוך התוכן).
  client_id uuid references public.clients (id) on delete set null,
  client_site_id uuid references public.client_sites (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  -- נעילה אופטימיסטית למניעת התנגשויות.
  version integer not null default 0,

  -- המספר הסידורי ייחודי בתוך העסק ואינו חוזר.
  constraint pest_logs_serial_unique_per_org unique (organization_id, serial_number),
  constraint pest_logs_client_idem_unique unique (organization_id, client_idempotency_key),
  constraint pest_logs_completion_idem_unique unique (organization_id, completion_idempotency_key),

  -- יומן שהושלם חייב מספר סידורי, snapshot, hash וזמן השלמה.
  constraint pest_logs_completed_shape check (
    status <> 'completed'
    or (serial_number is not null and snapshot is not null and document_hash is not null and completed_at is not null)
  ),
  -- טיוטה לא יכולה להיות ממוספרת.
  constraint pest_logs_draft_shape check (status <> 'draft' or serial_number is null),
  -- ביטול מחייב סיבה.
  constraint pest_logs_cancelled_shape check (
    status <> 'cancelled' or (cancellation_reason is not null and length(btrim(cancellation_reason)) > 0)
  ),
  -- גרסת תיקון מחייבת סיבת תיקון והפניה למקור.
  constraint pest_logs_correction_shape check (
    corrects_log_id is null
    or (correction_reason is not null and length(btrim(correction_reason)) > 0 and document_version > 1)
  )
);
create index if not exists pest_logs_org_status_idx on public.pest_logs (organization_id, status);
create index if not exists pest_logs_org_serial_idx on public.pest_logs (organization_id, serial_number desc);
create index if not exists pest_logs_root_idx on public.pest_logs (root_log_id);
create index if not exists pest_logs_completed_at_idx on public.pest_logs (organization_id, completed_at desc);
-- חיפוש טקסט חופשי על תוכן היומן.
create index if not exists pest_logs_content_gin on public.pest_logs using gin (content jsonb_path_ops);
comment on table public.pest_logs is 'יומני ביצוע הדברה. לאחר השלמה — בלתי ניתנים לשינוי או למחיקה.';

-- ── pest_findings — דרישה 6 ──────────────────────────────────────────────────
create table if not exists public.pest_findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  pest_log_id uuid not null references public.pest_logs (id) on delete cascade,
  position integer not null default 0,
  pest_name text not null check (length(btrim(pest_name)) > 0),
  pest_catalog_code text,
  identification_actions text not null check (length(btrim(identification_actions)) > 0),
  development_stage text not null check (length(btrim(development_stage)) > 0),
  infestation_signs text not null check (length(btrim(infestation_signs)) > 0),
  finding_location text not null check (length(btrim(finding_location)) > 0),
  infestation_level text not null check (infestation_level in ('low', 'medium', 'high')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  version integer not null default 0
);
create index if not exists pest_findings_log_idx on public.pest_findings (pest_log_id);
create index if not exists pest_findings_org_idx on public.pest_findings (organization_id);

-- ── prevention_actions — דרישה 7 ─────────────────────────────────────────────
create table if not exists public.prevention_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  pest_log_id uuid not null references public.pest_logs (id) on delete cascade,
  position integer not null default 0,
  description text not null check (length(btrim(description)) > 0),
  status text not null check (status in ('checked', 'recommended', 'performed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  version integer not null default 0
);
create index if not exists prevention_actions_log_idx on public.prevention_actions (pest_log_id);
create index if not exists prevention_actions_org_idx on public.prevention_actions (organization_id);

-- ── pesticide_applications — דרישה 12 ────────────────────────────────────────
create table if not exists public.pesticide_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  pest_log_id uuid not null references public.pest_logs (id) on delete cascade,
  position integer not null default 0,
  application_key text not null,
  target_pest_name text not null check (length(btrim(target_pest_name)) > 0),
  product_id uuid references public.products (id) on delete set null,
  product_trade_name text not null check (length(btrim(product_trade_name)) > 0),
  batch_number text not null check (length(btrim(batch_number)) > 0),
  active_ingredient_name text not null check (length(btrim(active_ingredient_name)) > 0),
  active_ingredient_concentration_percent numeric(7, 3) not null
    check (active_ingredient_concentration_percent > 0 and active_ingredient_concentration_percent <= 100),
  dosage numeric(14, 4) not null check (dosage > 0),
  dosage_unit text not null check (length(btrim(dosage_unit)) > 0),
  mixture_kind text not null check (mixture_kind in ('solution', 'mixture', 'traps')),
  mixture_quantity numeric(14, 4) not null check (mixture_quantity > 0),
  mixture_unit text not null check (length(btrim(mixture_unit)) > 0),
  quantity_basis text not null check (quantity_basis in ('length', 'area', 'volume', 'unit')),
  basis_amount numeric(14, 4) not null check (basis_amount > 0),
  basis_unit text not null check (length(btrim(basis_unit)) > 0),
  ready_to_use boolean not null default false,
  ready_to_use_concentration_percent numeric(7, 3) not null
    check (ready_to_use_concentration_percent > 0 and ready_to_use_concentration_percent <= 100),
  -- סומן כאשר הערך נגזר בשל תכשיר מוכן לשימוש ולא הוזן בנפרד.
  ready_to_use_concentration_derived boolean not null default false,
  application_method text not null check (length(btrim(application_method)) > 0),
  product_snapshot jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  version integer not null default 0,
  -- ערך נגזר מותר רק בתכשיר מוכן לשימוש.
  constraint applications_derived_only_rtu check (ready_to_use_concentration_derived = false or ready_to_use = true),
  constraint applications_key_unique unique (pest_log_id, application_key)
);
create index if not exists pesticide_applications_log_idx on public.pesticide_applications (pest_log_id);
create index if not exists pesticide_applications_org_idx on public.pesticide_applications (organization_id);

-- ── assistant_exterminators — דרישה 9 ────────────────────────────────────────
create table if not exists public.assistant_exterminators (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  pest_log_id uuid not null references public.pest_logs (id) on delete cascade,
  position integer not null default 0,
  full_name text not null check (length(btrim(full_name)) > 0),
  license_type text not null check (length(btrim(license_type)) > 0),
  license_number text not null check (length(btrim(license_number)) > 0),
  phone text not null check (length(btrim(phone)) > 0),
  email text not null check (length(btrim(email)) > 0),
  address text not null check (length(btrim(address)) > 0),
  instructions_given boolean not null,
  instructions_details text,
  received_log_copy boolean not null default false,
  received_log_copy_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  version integer not null default 0
);
create index if not exists assistant_exterminators_log_idx on public.assistant_exterminators (pest_log_id);
create index if not exists assistant_exterminators_org_idx on public.assistant_exterminators (organization_id);

-- ── bait_stations — תחנות האכלה ──────────────────────────────────────────────
create table if not exists public.bait_stations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- תחנה יכולה להיות קבועה באתר (client_site_id) ו/או מתועדת ביומן מסוים.
  client_site_id uuid references public.client_sites (id) on delete cascade,
  pest_log_id uuid references public.pest_logs (id) on delete cascade,
  position integer not null default 0,
  station_number text not null check (length(btrim(station_number)) > 0),
  location_description text not null check (length(btrim(location_description)) > 0),
  status text not null check (status in ('intact', 'consumed', 'damaged', 'missing', 'replaced', 'new')),
  consumption_level text check (consumption_level in ('none', 'partial', 'full')),
  product_trade_name text,
  coordinates jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  version integer not null default 0,
  constraint bait_stations_scope check (client_site_id is not null or pest_log_id is not null)
);
create index if not exists bait_stations_log_idx on public.bait_stations (pest_log_id);
create index if not exists bait_stations_site_idx on public.bait_stations (client_site_id);
create index if not exists bait_stations_org_idx on public.bait_stations (organization_id);

-- ── attachments — תמונות, מסמכים ו-PDF ───────────────────────────────────────
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  pest_log_id uuid references public.pest_logs (id) on delete cascade,
  kind text not null check (kind in ('photo', 'document', 'pdf', 'signature')),
  -- נתיב באחסון הפרטי. שם הקובץ אקראי, ללא מידע מזהה.
  storage_bucket text not null default 'pest-log-files',
  storage_path text not null check (length(btrim(storage_path)) > 0),
  original_file_name text,
  mime_type text not null check (length(btrim(mime_type)) > 0),
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  caption text,
  captured_at timestamptz,
  coordinates jsonb,
  -- עבור ה-PDF של היומן: לאיזו גרסת מסמך הוא שייך.
  document_version integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  version integer not null default 0,
  constraint attachments_path_unique unique (storage_bucket, storage_path)
);
create index if not exists attachments_log_idx on public.attachments (pest_log_id);
create index if not exists attachments_org_idx on public.attachments (organization_id);

-- ── signatures — דרישה 15 ────────────────────────────────────────────────────
create table if not exists public.signatures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  pest_log_id uuid not null references public.pest_logs (id) on delete cascade,
  -- מדביר / מדביר מסייע / מקבל היומן.
  signer_role text not null check (signer_role in ('exterminator', 'assistant', 'recipient')),
  assistant_id uuid references public.assistant_exterminators (id) on delete cascade,
  signer_name text not null check (length(btrim(signer_name)) > 0),
  storage_bucket text not null default 'pest-log-files',
  storage_path text not null check (length(btrim(storage_path)) > 0),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  signed_at timestamptz not null,
  -- אישור מפורש של החותם.
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  version integer not null default 0,
  constraint signatures_assistant_link check (signer_role <> 'assistant' or assistant_id is not null)
);
create index if not exists signatures_log_idx on public.signatures (pest_log_id);
create index if not exists signatures_org_idx on public.signatures (organization_id);

-- ── audit_events ─────────────────────────────────────────────────────────────
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_user_id uuid,
  action text not null check (length(btrim(action)) > 0),
  entity_type text not null,
  entity_id uuid,
  -- מטא-נתונים תפעוליים בלבד. אין לשמור כאן מידע אישי — ראו docs/security-and-retention.md.
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
create index if not exists audit_events_org_idx on public.audit_events (organization_id, occurred_at desc);
create index if not exists audit_events_entity_idx on public.audit_events (entity_type, entity_id);
comment on table public.audit_events is 'audit trail. append-only: אין עדכון ואין מחיקה.';

-- ── sync_operations — תור הסנכרון ────────────────────────────────────────────
create table if not exists public.sync_operations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- מפתח ייחודי שנוצר בלקוח. מונע ביצוע כפול של אותה פעולה.
  idempotency_key text not null,
  operation_type text not null check (operation_type in (
    'upsert_draft', 'complete_log', 'upload_attachment', 'upsert_client',
    'upsert_site', 'upsert_bait_station', 'cancel_log', 'correct_log'
  )),
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'applied', 'failed', 'superseded')),
  attempts integer not null default 0,
  last_error text,
  -- זמן שנרשם בלקוח, לצורך יישוב התנגשויות.
  client_updated_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  constraint sync_operations_idem_unique unique (organization_id, idempotency_key)
);
create index if not exists sync_operations_org_status_idx on public.sync_operations (organization_id, status);
comment on table public.sync_operations is 'פעולות שהמתינו לסנכרון. מפתח ה-idempotency מונע כפילויות.';
