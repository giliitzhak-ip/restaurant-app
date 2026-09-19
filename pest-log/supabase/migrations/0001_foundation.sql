-- ─────────────────────────────────────────────────────────────────────────────
-- 0001 — תוספים, סכמת עזר, וטריגרים משותפים.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

create schema if not exists app;
comment on schema app is 'פונקציות עזר פנימיות של יומן ביצוע ההדברה';

-- ── טריגר גנרי: עדכון updated_at ו-updated_by בכל שינוי ──────────────────────
create or replace function app.touch_row()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if to_jsonb(new) ? 'updated_by' then
    -- auth.uid() הוא null בקריאות service_role; אז נשמר המשתמש שנשלח מהקוד.
    if auth.uid() is not null then
      new.updated_by := auth.uid();
    end if;
  end if;
  return new;
end;
$$;

-- ── טריגר גנרי: השלמת created_by בעת יצירה ───────────────────────────────────
create or replace function app.stamp_created_by()
returns trigger
language plpgsql
as $$
begin
  if new.created_by is null and auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  if new.updated_by is null then
    new.updated_by := new.created_by;
  end if;
  return new;
end;
$$;

-- ── הארגון של המשתמש המחובר ──────────────────────────────────────────────────
-- SECURITY DEFINER כדי שלא תיווצר רקורסיה מול ה-RLS של profiles.
-- plpgsql ולא sql: הגוף מתייחס ל-public.profiles שנוצרת ב-0002, ו-plpgsql
-- מאחר את פתרון השמות לזמן הריצה.
create or replace function app.current_org_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, app, auth
as $$
declare
  v_org uuid;
begin
  select p.organization_id into v_org
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  limit 1;
  return v_org;
end;
$$;

create or replace function app.current_role_name()
returns text
language plpgsql
stable
security definer
set search_path = public, app, auth
as $$
declare
  v_role text;
begin
  select p.role into v_role
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  limit 1;
  return v_role;
end;
$$;

-- האם המשתמש המחובר הוא מנהל בארגון (נדרש למחיקה רכה).
create or replace function app.is_org_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public, app, auth
as $$
begin
  return coalesce(app.current_role_name() in ('owner', 'manager'), false);
end;
$$;

-- ── JSON קנוני (מפתחות ממוינים) ל-hash יציב של המסמך ────────────────────────
create or replace function app.canonical_json(value jsonb)
returns text
language sql
immutable
as $$
  select case jsonb_typeof(value)
    when 'object' then
      coalesce(
        '{' || (
          select string_agg(
            to_json(kv.key)::text || ':' || app.canonical_json(kv.value),
            ','
            order by kv.key
          )
          from jsonb_each(value) kv
        ) || '}',
        '{}'
      )
    when 'array' then
      coalesce(
        '[' || (
          select string_agg(app.canonical_json(elem.value), ',' order by elem.ord)
          from jsonb_array_elements(value) with ordinality elem(value, ord)
        ) || ']',
        '[]'
      )
    else value::text
  end;
$$;

create or replace function app.document_hash(value jsonb)
returns text
language sql
immutable
as $$
  select encode(digest(app.canonical_json(value), 'sha256'), 'hex');
$$;

grant usage on schema app to authenticated, service_role;
