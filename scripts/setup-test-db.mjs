#!/usr/bin/env node
/**
 * Create and migrate a DEDICATED test database.
 *
 * Why this exists: integration tests share a Postgres instance with
 * development, and the demo seed places 22 providers around Tel Aviv. Those
 * providers sit inside the radius the dispatch tests search, so whether a
 * test passed depended on whether someone had run `db:seed` — the tests were
 * coupled to unrelated data.
 *
 * The test database gets the schema and the reference/configuration rows from
 * db/migrations (categories, services, settings, fee rules), which tests
 * legitimately need, but never the demo seed.
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import pg from 'pg';

const adminUrl =
  process.env.DATABASE_ADMIN_URL ??
  'postgresql://getservice:getservice@127.0.0.1:5432/getservice';

const testDbName = process.env.TEST_DB_NAME ?? 'getservice_test';

function urlFor(base, database) {
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
}

async function main() {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(testDbName)) {
    throw new Error(`Unsafe database name: ${testDbName}`);
  }

  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();

  const { rows } = await admin.query('select 1 from pg_database where datname = $1', [testDbName]);
  if (rows.length === 0) {
    // CREATE DATABASE cannot run inside a transaction or take parameters.
    await admin.query(`create database ${testDbName}`);
    process.stdout.write(`• created database ${testDbName}\n`);
  } else {
    process.stdout.write(`• database ${testDbName} already exists\n`);
  }
  await admin.end();

  const testAdminUrl = urlFor(adminUrl, testDbName);
  const testAppUrl = urlFor(
    process.env.DATABASE_URL ??
      'postgresql://getservice_app:getservice_app@127.0.0.1:5432/getservice',
    testDbName,
  );

  // Extensions and the app role's access must exist before migrations run.
  const bootstrap = new pg.Client({ connectionString: testAdminUrl });
  await bootstrap.connect();
  await bootstrap.query('create extension if not exists postgis');
  await bootstrap.query('create extension if not exists pgcrypto');
  const appUser = new URL(testAppUrl).username;
  await bootstrap.query(`grant connect on database ${testDbName} to ${appUser}`);
  await bootstrap.query(`grant usage on schema public to ${appUser}`);
  await bootstrap.end();

  const migrate = spawnSync(process.execPath, ['scripts/migrate.mjs', '--reset'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_ADMIN_URL: testAdminUrl, DATABASE_URL: testAppUrl },
  });
  if (migrate.status !== 0) throw new Error('Migrations failed on the test database');

  process.stdout.write(`✅ test database ready: ${testDbName}\n`);
  process.stdout.write(`   TEST_DATABASE_URL=${testAppUrl}\n`);
}

main().catch((error) => {
  process.stderr.write(`\n❌ test database setup failed: ${error.message}\n`);
  process.exitCode = 1;
});
