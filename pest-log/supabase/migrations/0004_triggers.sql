-- ─────────────────────────────────────────────────────────────────────────────
-- 0004 — טריגרים: חתימות זמן, נעילת יומן שהושלם, audit append-only.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── חיבור הטריגרים הגנריים לכל הטבלאות ───────────────────────────────────────
do $$
declare
  t text;
  tables text[] := array[
    'organizations', 'profiles', 'pesticide_licenses', 'clients', 'client_sites',
    'products', 'pest_catalog', 'warning_templates', 'pest_logs', 'pest_findings',
    'prevention_actions', 'pesticide_applications', 'assistant_exterminators',
    'bait_stations', 'attachments', 'signatures', 'sync_operations'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists trg_%1$s_touch on public.%1$I', t);
    execute format(
      'create trigger trg_%1$s_touch before update on public.%1$I
       for each row execute function app.touch_row()', t);

    execute format('drop trigger if exists trg_%1$s_created_by on public.%1$I', t);
    execute format(
      'create trigger trg_%1$s_created_by before insert on public.%1$I
       for each row execute function app.stamp_created_by()', t);
  end loop;
end $$;

-- ── נעילת יומן שהושלם או בוטל ────────────────────────────────────────────────
-- לאחר השלמה לא ניתן לשנות את היומן. תיקון מתבצע בגרסת תיקון מקושרת.
-- החריג היחיד: מחיקה רכה ע"י מנהל לאחר תקופת השמירה, דרך
-- public.soft_delete_pest_log, שמסמנת דגל session מבוקר.
create or replace function app.guard_pest_log_immutability()
returns trigger
language plpgsql
as $$
declare
  v_soft_delete_only boolean;
begin
  if old.status = 'draft' then
    return new;
  end if;

  -- האם השינוי הוא רק מחיקה רכה מאושרת?
  v_soft_delete_only :=
    coalesce(current_setting('app.soft_delete_context', true), 'off') = 'on'
    and old.deleted_at is null
    and new.deleted_at is not null;

  if v_soft_delete_only then
    return new;
  end if;

  -- שינוי כלשהו בשדות המסמך אסור.
  if row(new.status, new.content, new.snapshot, new.serial_number, new.document_hash,
         new.document_version, new.completed_at, new.cancelled_at, new.cancellation_reason,
         new.corrects_log_id, new.correction_reason, new.root_log_id, new.organization_id)
     is distinct from
     row(old.status, old.content, old.snapshot, old.serial_number, old.document_hash,
         old.document_version, old.completed_at, old.cancelled_at, old.cancellation_reason,
         old.corrects_log_id, old.correction_reason, old.root_log_id, old.organization_id)
  then
    raise exception 'יומן שהושלם או בוטל אינו ניתן לשינוי. לתיקון יש להפיק גרסת תיקון מקושרת.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pest_logs_immutable on public.pest_logs;
create trigger trg_pest_logs_immutable
  before update on public.pest_logs
  for each row execute function app.guard_pest_log_immutability();

-- ── איסור מחיקה פיזית של יומן ────────────────────────────────────────────────
create or replace function app.forbid_pest_log_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'לא ניתן למחוק יומן הדברה מהמסד. מחיקה מתבצעת כמחיקה רכה בלבד, בהרשאת מנהל ולאחר תקופת השמירה.'
    using errcode = 'P0001';
  return null;
end;
$$;

drop trigger if exists trg_pest_logs_no_delete on public.pest_logs;
create trigger trg_pest_logs_no_delete
  before delete on public.pest_logs
  for each row execute function app.forbid_pest_log_delete();

-- ── טבלאות הבת של יומן שהושלם נעולות אף הן ───────────────────────────────────
create or replace function app.guard_child_of_completed_log()
returns trigger
language plpgsql
as $$
declare
  v_log_id uuid;
  v_status text;
begin
  -- בזמן ריצת פונקציית ההשלמה מותר לכתוב את השורות המנורמלות.
  if coalesce(current_setting('app.completion_context', true), 'off') = 'on' then
    return coalesce(new, old);
  end if;

  v_log_id := coalesce(
    case when tg_op = 'DELETE' then null else (to_jsonb(new) ->> 'pest_log_id')::uuid end,
    case when tg_op = 'INSERT' then null else (to_jsonb(old) ->> 'pest_log_id')::uuid end
  );

  if v_log_id is null then
    return coalesce(new, old);
  end if;

  select status into v_status from public.pest_logs where id = v_log_id;

  if v_status is not null and v_status <> 'draft' then
    raise exception 'לא ניתן לשנות רשומות של יומן שהושלם או בוטל (%).', tg_table_name
      using errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
  child_tables text[] := array[
    'pest_findings', 'prevention_actions', 'pesticide_applications',
    'assistant_exterminators', 'bait_stations', 'signatures'
  ];
begin
  foreach t in array child_tables loop
    execute format('drop trigger if exists trg_%1$s_guard on public.%1$I', t);
    execute format(
      'create trigger trg_%1$s_guard before insert or update or delete on public.%1$I
       for each row execute function app.guard_child_of_completed_log()', t);
  end loop;
end $$;

-- ── audit_events הוא append-only ─────────────────────────────────────────────
create or replace function app.forbid_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_events הוא append-only: אין לעדכן או למחוק רשומות ביקורת.'
    using errcode = 'P0001';
  return null;
end;
$$;

drop trigger if exists trg_audit_events_immutable on public.audit_events;
create trigger trg_audit_events_immutable
  before update or delete on public.audit_events
  for each row execute function app.forbid_audit_mutation();

-- ── העלאת version בכל עדכון (נעילה אופטימיסטית) ──────────────────────────────
create or replace function app.bump_version()
returns trigger
language plpgsql
as $$
begin
  if new.version = old.version then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
  tables text[] := array[
    'organizations', 'profiles', 'pesticide_licenses', 'clients', 'client_sites',
    'products', 'pest_catalog', 'warning_templates', 'pest_logs', 'bait_stations', 'attachments'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists trg_%1$s_version on public.%1$I', t);
    execute format(
      'create trigger trg_%1$s_version before update on public.%1$I
       for each row execute function app.bump_version()', t);
  end loop;
end $$;
