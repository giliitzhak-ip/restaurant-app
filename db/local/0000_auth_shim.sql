-- ===========================================================================
-- LOCAL-ONLY Supabase auth shim.
--
-- On a Supabase project the `auth` schema, `auth.users` table and the
-- `auth.uid()` / `auth.role()` helpers already exist, and this file is
-- SKIPPED automatically by scripts/migrate.mjs (it only runs when the `auth`
-- schema is absent).
--
-- The point of the shim is that it reproduces Supabase's *exact* contract:
-- PostgREST sets the `request.jwt.claims` GUC per request and runs queries as
-- the `authenticated` role; `auth.uid()` reads the `sub` claim out of that
-- GUC. Because we do the same thing in src/lib/db, the RLS policies in
-- db/migrations are the real enforcement path both locally and on Supabase.
-- ===========================================================================

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  phone text unique,
  encrypted_password text,
  created_at timestamptz not null default now()
);

-- Mirrors Supabase's definition.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    'anon'
  )
$$;

-- Supabase ships these roles; create them locally so GRANTs match.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;

-- The server creates accounts on this shim (on Supabase, Supabase Auth does
-- it), so service_role needs write access. Without this, registration fails
-- with 42501 and no account can ever be created.
grant insert, update, delete on auth.users to service_role;

comment on schema auth is 'getservice local auth shim — replaced by Supabase Auth in production';
