-- ===========================================================================
-- 0015 — Let the server create accounts on the LOCAL auth shim
--
-- Registration failed with 42501 ("permission denied for table users"):
-- db/local/0000_auth_shim.sql granted service_role SELECT on auth.users only,
-- so POST /api/auth/register could never insert. Nothing caught it because
-- the earlier probes all used role:"admin", which is rejected at validation
-- and never reaches the database.
--
-- This applies ONLY to the local shim. On a real Supabase project, Supabase
-- Auth owns auth.users and the application never writes it directly — so the
-- guard below detects the shim by its structure (our table has
-- encrypted_password but none of Supabase's own columns) and this migration
-- becomes a no-op there rather than fighting a managed schema.
-- ===========================================================================

do $$
declare
  v_is_local_shim boolean;
begin
  select
    exists (
      select 1 from information_schema.columns
       where table_schema = 'auth' and table_name = 'users'
         and column_name = 'encrypted_password'
    )
    and not exists (
      -- Columns Supabase's own auth.users carries and the shim does not.
      select 1 from information_schema.columns
       where table_schema = 'auth' and table_name = 'users'
         and column_name in ('instance_id', 'raw_app_meta_data', 'aud')
    )
  into v_is_local_shim;

  if v_is_local_shim then
    grant insert, update, delete on auth.users to service_role;
    -- Mark it, so the origin of this schema is no longer a matter of inference.
    comment on schema auth is 'getservice local auth shim — replaced by Supabase Auth in production';
    raise notice 'local auth shim detected: granted write access on auth.users to service_role';
  else
    raise notice 'auth.users looks Supabase-managed: leaving its grants untouched';
  end if;
end
$$;
