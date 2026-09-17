-- ============================================================================
-- GET SERVICE — 0007  Storage buckets, storage RLS and realtime publication
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',            'avatars',            true,   5 * 1024 * 1024,
   array['image/png','image/jpeg','image/webp']),
  ('provider-gallery',   'provider-gallery',   true,  10 * 1024 * 1024,
   array['image/png','image/jpeg','image/webp']),
  ('job-media',          'job-media',          false, 50 * 1024 * 1024,
   array['image/png','image/jpeg','image/webp','video/mp4','video/quicktime']),
  ('chat-media',         'chat-media',         false, 10 * 1024 * 1024,
   array['image/png','image/jpeg','image/webp']),
  ('provider-documents', 'provider-documents', false, 20 * 1024 * 1024,
   array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Convention: every object path starts with the owning user's uuid, e.g.
--   job-media/<user_id>/<job_id>/<uuid>.jpg
-- so ownership is provable from the path alone.

-- ── Public read buckets ─────────────────────────────────────────────────────
drop policy if exists "public buckets are readable" on storage.objects;
create policy "public buckets are readable" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('avatars', 'provider-gallery'));

drop policy if exists "users write their own public media" on storage.objects;
create policy "users write their own public media" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('avatars', 'provider-gallery')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users update their own public media" on storage.objects;
create policy "users update their own public media" on storage.objects
  for update to authenticated
  using (bucket_id in ('avatars', 'provider-gallery')
         and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users delete their own public media" on storage.objects;
create policy "users delete their own public media" on storage.objects
  for delete to authenticated
  using (bucket_id in ('avatars', 'provider-gallery')
         and (storage.foldername(name))[1] = auth.uid()::text);

-- ── Private job & chat media ────────────────────────────────────────────────
drop policy if exists "owners upload private job media" on storage.objects;
create policy "owners upload private job media" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('job-media', 'chat-media')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Readable by the uploader, by the counterpart on the job, or by an admin.
drop policy if exists "job participants read private media" on storage.objects;
create policy "job participants read private media" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('job-media', 'chat-media')
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
      -- Only objects that follow the `<user_id>/…` convention can be shared;
      -- casting anything else to uuid would raise instead of denying.
      or (
        (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and public.shares_job_with(((storage.foldername(name))[1])::uuid)
      )
    )
  );

drop policy if exists "owners delete private job media" on storage.objects;
create policy "owners delete private job media" on storage.objects
  for delete to authenticated
  using (bucket_id in ('job-media', 'chat-media')
         and (storage.foldername(name))[1] = auth.uid()::text);

-- ── Provider documents: uploader + admin only, never a counterpart ──────────
drop policy if exists "providers upload own documents" on storage.objects;
create policy "providers upload own documents" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'provider-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "providers and admins read documents" on storage.objects;
create policy "providers and admins read documents" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'provider-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "providers delete own pending documents" on storage.objects;
create policy "providers delete own pending documents" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'provider-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── Realtime publication ────────────────────────────────────────────────────
-- Only the tables the apps actually subscribe to; RLS still applies per client.
do $$
declare t text;
begin
  foreach t in array array[
    'jobs', 'job_offers', 'job_assignments', 'job_status_history',
    'messages', 'provider_locations', 'notifications'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I;', t);
    exception
      when duplicate_object then null;
      when undefined_object then null; -- publication absent (bare Postgres)
    end;
  end loop;
end $$;

-- Realtime needs the full old row to deliver reliable UPDATE payloads.
alter table public.jobs              replica identity full;
alter table public.job_offers        replica identity full;
alter table public.provider_locations replica identity full;
