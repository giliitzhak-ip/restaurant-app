-- ============================================================================
-- Minimal stand-in for the schemas Supabase manages (auth, storage, roles).
--
-- Only needed to apply the migrations and run rls-verification.sql against a
-- plain PostgreSQL server. On Supabase itself these already exist — do not run
-- this there.
--
--   createdb getservice_test
--   psql -d getservice_test -f supabase/tests/local-shim.sql
--   for f in supabase/migrations/*.sql; do psql -d getservice_test -f "$f"; done
--   psql -d getservice_test -f supabase/tests/rls-verification.sql
--
-- Requires the `postgis` and `pgcrypto` extensions to be installed.
-- ============================================================================

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

create extension if not exists pgcrypto with schema extensions;

create table if not exists auth.users (
  id                 uuid primary key default extensions.gen_random_uuid(),
  email              text,
  phone              text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at         timestamptz default now()
);

-- Supabase derives this from the request JWT; here it reads a session setting,
-- which is what `set local "request.jwt.claim.sub"` in the tests provides.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id         uuid primary key default extensions.gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text,
  owner      uuid,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$ select string_to_array(name, '/') $$;

do $$ begin
  create publication supabase_realtime;
exception when duplicate_object then null; end $$;
