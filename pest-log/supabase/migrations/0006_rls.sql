-- ─────────────────────────────────────────────────────────────────────────────
-- 0006 — Row Level Security על כל הטבלאות.
-- הכלל: כל משתמש רואה ומשנה רק את המידע של הארגון שלו.
-- אין הסתמכות על הרשאות בצד הלקוח — זו שכבת האכיפה.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  t text;
  all_tables text[] := array[
    'organizations', 'profiles', 'pesticide_licenses', 'clients', 'client_sites',
    'products', 'pest_catalog', 'warning_templates', 'pest_logs', 'pest_findings',
    'prevention_actions', 'pesticide_applications', 'assistant_exterminators',
    'bait_stations', 'attachments', 'signatures', 'audit_events', 'sync_operations'
  ];
begin
  foreach t in array all_tables loop
    execute format('alter table public.%I enable row level security', t);
    -- FORCE כדי שגם הבעלים של הטבלה לא יעקוף בטעות את המדיניות.
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- ── organizations ────────────────────────────────────────────────────────────
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select to authenticated
  using (id = app.current_org_id() and deleted_at is null);

drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations
  for update to authenticated
  using (id = app.current_org_id() and app.is_org_admin() and deleted_at is null)
  with check (id = app.current_org_id());
-- יצירת ארגון ומחיקתו אינן פעולות של הלקוח: הן נעשות ב-service_role בלבד.

-- ── profiles ─────────────────────────────────────────────────────────────────
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    -- המשתמש רואה את עצמו תמיד, וגם את שאר חברי הארגון שלו.
    user_id = auth.uid()
    or (organization_id = app.current_org_id() and deleted_at is null)
  );

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (user_id = auth.uid() and deleted_at is null)
  -- משתמש לא יכול להעביר את עצמו לארגון אחר ולא להעלות את דרגתו.
  with check (
    user_id = auth.uid()
    and organization_id = app.current_org_id()
    and role = app.current_role_name()
  );

drop policy if exists profiles_admin_manage on public.profiles;
create policy profiles_admin_manage on public.profiles
  for update to authenticated
  using (organization_id = app.current_org_id() and app.is_org_admin())
  with check (organization_id = app.current_org_id());

drop policy if exists profiles_admin_insert on public.profiles;
create policy profiles_admin_insert on public.profiles
  for insert to authenticated
  with check (organization_id = app.current_org_id() and app.is_org_admin());

-- ── מדיניות אחידה לטבלאות המשויכות לארגון ────────────────────────────────────
-- select/insert/update לכל חבר ארגון; delete רק למנהל.
do $$
declare
  t text;
  org_tables text[] := array[
    'pesticide_licenses', 'clients', 'client_sites', 'products', 'pest_catalog',
    'warning_templates'
  ];
begin
  foreach t in array org_tables loop
    execute format('drop policy if exists %1$s_select on public.%1$I', t);
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated
       using (organization_id = app.current_org_id() and deleted_at is null)', t);

    execute format('drop policy if exists %1$s_insert on public.%1$I', t);
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated
       with check (organization_id = app.current_org_id())', t);

    execute format('drop policy if exists %1$s_update on public.%1$I', t);
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated
       using (organization_id = app.current_org_id())
       with check (organization_id = app.current_org_id())', t);

    execute format('drop policy if exists %1$s_delete on public.%1$I', t);
    execute format(
      'create policy %1$s_delete on public.%1$I for delete to authenticated
       using (organization_id = app.current_org_id() and app.is_org_admin())', t);
  end loop;
end $$;

-- ── pest_logs ────────────────────────────────────────────────────────────────
drop policy if exists pest_logs_select on public.pest_logs;
create policy pest_logs_select on public.pest_logs
  for select to authenticated
  using (organization_id = app.current_org_id() and deleted_at is null);

drop policy if exists pest_logs_insert on public.pest_logs;
create policy pest_logs_insert on public.pest_logs
  for insert to authenticated
  -- יומן חדש נוצר תמיד כטיוטה, בלי מספר סידורי ובלי snapshot.
  with check (
    organization_id = app.current_org_id()
    and status = 'draft'
    and serial_number is null
    and snapshot is null
    and document_hash is null
    and completed_at is null
  );

drop policy if exists pest_logs_update_draft on public.pest_logs;
create policy pest_logs_update_draft on public.pest_logs
  for update to authenticated
  -- רק טיוטה ניתנת לעריכה מהלקוח. ההשלמה מתבצעת בפונקציה בשרת.
  using (organization_id = app.current_org_id() and status = 'draft' and deleted_at is null)
  with check (organization_id = app.current_org_id() and status = 'draft');
-- אין מדיניות DELETE: מחיקה פיזית חסומה גם ע"י טריגר.

-- ── טבלאות הבת של יומן ───────────────────────────────────────────────────────
-- נראות לפי הארגון; כתיבה מהלקוח מותרת רק כל עוד היומן טיוטה.
do $$
declare
  t text;
  child_tables text[] := array[
    'pest_findings', 'prevention_actions', 'pesticide_applications',
    'assistant_exterminators', 'signatures'
  ];
begin
  foreach t in array child_tables loop
    execute format('drop policy if exists %1$s_select on public.%1$I', t);
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated
       using (organization_id = app.current_org_id())', t);

    execute format('drop policy if exists %1$s_insert on public.%1$I', t);
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated
       with check (
         organization_id = app.current_org_id()
         and exists (
           select 1 from public.pest_logs l
            where l.id = pest_log_id
              and l.organization_id = app.current_org_id()
              and l.status = ''draft''
         )
       )', t);

    execute format('drop policy if exists %1$s_update on public.%1$I', t);
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated
       using (
         organization_id = app.current_org_id()
         and exists (
           select 1 from public.pest_logs l
            where l.id = pest_log_id and l.organization_id = app.current_org_id() and l.status = ''draft''
         )
       )
       with check (organization_id = app.current_org_id())', t);

    execute format('drop policy if exists %1$s_delete on public.%1$I', t);
    execute format(
      'create policy %1$s_delete on public.%1$I for delete to authenticated
       using (
         organization_id = app.current_org_id()
         and exists (
           select 1 from public.pest_logs l
            where l.id = pest_log_id and l.organization_id = app.current_org_id() and l.status = ''draft''
         )
       )', t);
  end loop;
end $$;

-- ── bait_stations ────────────────────────────────────────────────────────────
-- תחנות יכולות להיות קבועות באתר (בלי יומן), ולכן המדיניות רחבה יותר.
drop policy if exists bait_stations_select on public.bait_stations;
create policy bait_stations_select on public.bait_stations
  for select to authenticated
  using (organization_id = app.current_org_id() and deleted_at is null);

drop policy if exists bait_stations_insert on public.bait_stations;
create policy bait_stations_insert on public.bait_stations
  for insert to authenticated
  with check (
    organization_id = app.current_org_id()
    and (
      pest_log_id is null
      or exists (
        select 1 from public.pest_logs l
         where l.id = pest_log_id and l.organization_id = app.current_org_id() and l.status = 'draft'
      )
    )
  );

drop policy if exists bait_stations_update on public.bait_stations;
create policy bait_stations_update on public.bait_stations
  for update to authenticated
  using (
    organization_id = app.current_org_id()
    and (
      pest_log_id is null
      or exists (
        select 1 from public.pest_logs l
         where l.id = pest_log_id and l.organization_id = app.current_org_id() and l.status = 'draft'
      )
    )
  )
  with check (organization_id = app.current_org_id());

drop policy if exists bait_stations_delete on public.bait_stations;
create policy bait_stations_delete on public.bait_stations
  for delete to authenticated
  using (organization_id = app.current_org_id() and pest_log_id is null);

-- ── attachments ──────────────────────────────────────────────────────────────
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments
  for select to authenticated
  using (organization_id = app.current_org_id() and deleted_at is null);

drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments
  for insert to authenticated
  with check (organization_id = app.current_org_id());

drop policy if exists attachments_update on public.attachments;
create policy attachments_update on public.attachments
  for update to authenticated
  -- קובץ המצורף ליומן שהושלם אינו ניתן לשינוי מהלקוח.
  using (
    organization_id = app.current_org_id()
    and (
      pest_log_id is null
      or exists (
        select 1 from public.pest_logs l
         where l.id = pest_log_id and l.organization_id = app.current_org_id() and l.status = 'draft'
      )
    )
  )
  with check (organization_id = app.current_org_id());

drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments
  for delete to authenticated
  using (
    organization_id = app.current_org_id()
    and (
      pest_log_id is null
      or exists (
        select 1 from public.pest_logs l
         where l.id = pest_log_id and l.organization_id = app.current_org_id() and l.status = 'draft'
      )
    )
  );

-- ── audit_events — קריאה בלבד, ולמנהל בלבד ───────────────────────────────────
drop policy if exists audit_events_select on public.audit_events;
create policy audit_events_select on public.audit_events
  for select to authenticated
  using (organization_id = app.current_org_id() and app.is_org_admin());
-- אין INSERT/UPDATE/DELETE מהלקוח: רישום הביקורת נעשה בפונקציות השרת.

-- ── sync_operations ──────────────────────────────────────────────────────────
drop policy if exists sync_operations_select on public.sync_operations;
create policy sync_operations_select on public.sync_operations
  for select to authenticated
  using (organization_id = app.current_org_id());

drop policy if exists sync_operations_insert on public.sync_operations;
create policy sync_operations_insert on public.sync_operations
  for insert to authenticated
  with check (organization_id = app.current_org_id());

drop policy if exists sync_operations_update on public.sync_operations;
create policy sync_operations_update on public.sync_operations
  for update to authenticated
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

-- ── הרשאות טבלה בסיסיות ──────────────────────────────────────────────────────
grant usage on schema public to anon, authenticated, service_role;

do $$
declare
  t text;
  all_tables text[] := array[
    'organizations', 'profiles', 'pesticide_licenses', 'clients', 'client_sites',
    'products', 'pest_catalog', 'warning_templates', 'pest_logs', 'pest_findings',
    'prevention_actions', 'pesticide_applications', 'assistant_exterminators',
    'bait_stations', 'attachments', 'signatures', 'audit_events', 'sync_operations'
  ];
begin
  foreach t in array all_tables loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- anon לא נוגע בנתונים בכלל.
revoke all on all tables in schema public from anon;
