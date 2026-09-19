-- ─────────────────────────────────────────────────────────────────────────────
-- 0007 — אחסון פרטי לקבצים, תמונות, חתימות ו-PDF.
-- כל הקבצים ב-bucket פרטי. הגישה אליהם רק דרך signed URL קצר-מועד.
-- הקובץ עוטף את עצמו בבדיקה, כדי שירוץ גם על Postgres מקומי בלי סכמת storage.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'סכמת storage אינה קיימת (Postgres מקומי) — מדלג על הגדרות האחסון.';
    return;
  end if;

  -- bucket פרטי. 15MB לקובץ, ורק סוגי קבצים מותרים.
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'pest-log-files', 'pest-log-files', false, 15728640,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  )
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  -- מבנה הנתיב: <organization_id>/<log_id|misc>/<random>.<ext>
  -- המקטע הראשון הוא מזהה הארגון, וזה מה שה-RLS בודק.
  execute $pol$
    drop policy if exists pest_log_files_select on storage.objects;
    create policy pest_log_files_select on storage.objects
      for select to authenticated
      using (
        bucket_id = 'pest-log-files'
        and (storage.foldername(name))[1] = app.current_org_id()::text
      );
  $pol$;

  execute $pol$
    drop policy if exists pest_log_files_insert on storage.objects;
    create policy pest_log_files_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'pest-log-files'
        and (storage.foldername(name))[1] = app.current_org_id()::text
      );
  $pol$;

  -- אין UPDATE ואין DELETE מהלקוח: קובץ שנשמר ליומן אינו מוחלף.
  execute $pol$
    drop policy if exists pest_log_files_update on storage.objects;
    drop policy if exists pest_log_files_delete on storage.objects;
  $pol$;
end $$;
