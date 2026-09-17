#!/usr/bin/env node
/**
 * Migration runner.
 *
 * - Applies db/migrations/*.sql in filename order, once each, inside a
 *   transaction, recording them in schema_migrations.
 * - Applies db/local/0000_auth_shim.sql ONLY when the `auth` schema is
 *   absent, so running against a real Supabase project is a no-op for it.
 * - `--reset` drops and recreates the public schema first.
 */
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const ROOT = path.resolve(import.meta.dirname, '..');
const RESET = process.argv.includes('--reset');

// Schema work runs as the table OWNER, not as the restricted app login.
const connectionString =
  process.env.DATABASE_ADMIN_URL ??
  process.env.DATABASE_URL ??
  'postgresql://getservice:getservice@127.0.0.1:5432/getservice';

const client = new pg.Client({ connectionString });

function log(...args) {
  process.stdout.write(args.join(' ') + '\n');
}

async function main() {
  await client.connect();

  if (RESET) {
    log('⟳ resetting schema public');
    await client.query('drop schema if exists public cascade');
    await client.query('create schema public');
    // Roles and the auth shim survive a public-schema reset, but the shim's
    // functions live in `auth`, so only `public` is dropped here.
  }

  await client.query(`
    create table if not exists public.schema_migrations (
      filename   text primary key,
      checksum   text not null,
      applied_at timestamptz not null default now()
    )
  `);

  const { rows: authRows } = await client.query(
    `select 1 from information_schema.schemata where schema_name = 'auth'`,
  );

  const files = [];
  if (authRows.length === 0) {
    log('• auth schema absent → applying local Supabase auth shim');
    files.push(path.join(ROOT, 'db/local/0000_auth_shim.sql'));
  } else {
    log('• auth schema present → skipping local shim (Supabase-managed)');
  }

  const migrationDir = path.join(ROOT, 'db/migrations');
  const entries = (await readdir(migrationDir)).filter((f) => f.endsWith('.sql')).sort();
  files.push(...entries.map((f) => path.join(migrationDir, f)));

  const { rows: applied } = await client.query(
    'select filename, checksum from public.schema_migrations',
  );
  const appliedMap = new Map(applied.map((r) => [r.filename, r.checksum]));

  for (const file of files) {
    const name = path.basename(file);
    const sql = await readFile(file, 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex').slice(0, 16);
    const previous = appliedMap.get(name);

    if (previous === checksum) {
      log(`  ✓ ${name} (already applied)`);
      continue;
    }
    if (previous && previous !== checksum) {
      throw new Error(
        `Migration ${name} changed after being applied (${previous} -> ${checksum}). ` +
          `Add a new migration instead, or run with --reset in development.`,
      );
    }

    try {
      await client.query('begin');
      await client.query(sql);
      await client.query(
        `insert into public.schema_migrations (filename, checksum) values ($1, $2)
         on conflict (filename) do update set checksum = excluded.checksum,
                                              applied_at = now()`,
        [name, checksum],
      );
      await client.query('commit');
      log(`  → ${name} applied`);
    } catch (error) {
      await client.query('rollback');
      throw new Error(`Migration ${name} failed: ${error.message}`, { cause: error });
    }
  }

  log('✅ migrations complete');
}

main()
  .catch((error) => {
    process.stderr.write(`\n❌ ${error.message}\n`);
    if (error.cause?.position) {
      process.stderr.write(`   at SQL position ${error.cause.position}\n`);
    }
    process.exitCode = 1;
  })
  .finally(() => client.end());
