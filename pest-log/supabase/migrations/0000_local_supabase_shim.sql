-- ─────────────────────────────────────────────────────────────────────────────
-- 0000 — שכבת תאימות ל-Postgres מקומי בלבד (בדיקות).
-- ב-Supabase כל מה שכאן קיים ממילא, ולכן הקובץ מסומן כ-LOCAL ומופעל
-- רק ע"י scripts/migrate.mjs עם --local. אין להריץ אותו על פרויקט Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

create schema if not exists auth;

-- תפקידים שקיימים ב-Supabase.
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
end $$;

create table if not exists auth.users (
  id uuid primary key,
  email text unique,
  created_at timestamptz not null default now()
);

-- auth.uid() ב-Supabase קורא את ה-claim sub מתוך ה-JWT.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user);
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
