#!/usr/bin/env node
/**
 * Create the database roles GET SERVICE needs. Idempotent.
 *
 * Two logins, and the split matters:
 *
 *   owner  (DATABASE_ADMIN_URL) — runs migrations and seeds. Owns the tables.
 *   app    (DATABASE_URL)       — what the running application connects as.
 *                                 NOSUPERUSER, NOBYPASSRLS, NOINHERIT and
 *                                 NOT the table owner, so it cannot bypass
 *                                 RLS. It reaches data only by SET ROLE to
 *                                 anon / authenticated / service_role.
 *
 * On Supabase these roles already exist and this script is unnecessary.
 */
import process from 'node:process';
import pg from 'pg';

const adminUrl =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://getservice:getservice@127.0.0.1:5432/getservice';

const appUser = process.env.APP_DB_USER ?? 'getservice_app';
const appPassword = process.env.APP_DB_PASSWORD ?? 'getservice_app';

const client = new pg.Client({ connectionString: adminUrl });

async function main() {
  await client.connect();

  for (const role of ['anon', 'authenticated']) {
    await client.query(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = '${role}') then
          create role ${role} nologin noinherit;
        end if;
      end $$;
    `);
  }

  await client.query(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin noinherit bypassrls;
      end if;
    end $$;
  `);

  // A DO block cannot take bind parameters, so the identifier is validated
  // here and the password is passed through format(%L) for quoting.
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(appUser)) {
    throw new Error(`Unsafe role name: ${appUser}`);
  }

  const { rows: existing } = await client.query(
    'select 1 from pg_roles where rolname = $1',
    [appUser],
  );

  // NOINHERIT is deliberate: the app gets no privilege until it explicitly
  // SET ROLEs, so a missing SET ROLE fails loudly instead of quietly running
  // with more access than intended.
  const attributes = 'login noinherit nosuperuser nobypassrls';
  await client.query(
    `select format('%s role %I with ${attributes} password %L',
                   $1::text, $2::text, $3::text) as stmt`,
    [existing.length > 0 ? 'alter' : 'create', appUser, appPassword],
  ).then((result) => client.query(result.rows[0].stmt));

  await client.query(`grant anon, authenticated, service_role to ${appUser}`);
  const { rows } = await client.query('select current_database() as db');
  await client.query(`grant connect on database ${rows[0].db} to ${appUser}`);
  await client.query(`grant usage on schema public to ${appUser}`);
  await client.query(
    `do $$ begin
       if exists (select 1 from information_schema.schemata where schema_name='auth') then
         execute 'grant usage on schema auth to ${appUser}';
       end if;
     end $$;`,
  );

  // Verify the guarantee rather than assuming it.
  const { rows: check } = await client.query(
    `select rolsuper, rolbypassrls, rolinherit from pg_roles where rolname = $1`,
    [appUser],
  );
  const role = check[0];
  if (!role) throw new Error(`Role ${appUser} was not created`);
  if (role.rolsuper || role.rolbypassrls) {
    throw new Error(`${appUser} must not be able to bypass RLS`);
  }

  process.stdout.write(
    `✅ roles ready — app login "${appUser}" (superuser=${role.rolsuper}, bypassrls=${role.rolbypassrls}, inherit=${role.rolinherit})\n`,
  );
}

main()
  .catch((error) => {
    process.stderr.write(`\n❌ role setup failed: ${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => client.end());
