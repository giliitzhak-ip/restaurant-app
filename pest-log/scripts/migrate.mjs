#!/usr/bin/env node
/**
 * מריץ את קובצי ה-migrations בסדר, ומתעד אותם בטבלת app.schema_migrations.
 *
 *   node scripts/migrate.mjs --local           # כולל 0000_local_supabase_shim, ללא 0007_storage
 *   node scripts/migrate.mjs --url=postgres://...
 *
 * על פרויקט Supabase עדיף להריץ `supabase db push`; הסקריפט כאן קיים כדי
 * שהבדיקות והסביבה הנקייה יעבדו בלי תלות ב-Supabase CLI.
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, '..', 'supabase', 'migrations');

const args = process.argv.slice(2);
const isLocal = args.includes('--local');
const urlArg = args.find((a) => a.startsWith('--url='))?.slice('--url='.length);

/** הכתובת נקראת בזמן הקריאה, לא בזמן הייבוא — כדי שהמודול יהיה ניתן לייבוא מהבדיקות. */
function defaultConnectionString() {
  return urlArg ?? process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
}

export async function runMigrations({ connectionString: conn, local = false, quiet = false } = {}) {
  const resolved = conn ?? defaultConnectionString();
  if (!resolved) {
    throw new Error('חסרה כתובת מסד נתונים. יש להעביר --url=... או להגדיר DATABASE_URL.');
  }
  const client = new pg.Client({ connectionString: resolved });
  await client.connect();
  try {
    await client.query('create schema if not exists app');
    await client.query(`
      create table if not exists app.schema_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
    const applied = new Set(
      (await client.query('select filename from app.schema_migrations')).rows.map((r) => r.filename),
    );

    for (const file of files) {
      // 0000 הוא שכבת תאימות מקומית בלבד.
      if (file.startsWith('0000_') && !local) continue;
      if (applied.has(file)) continue;

      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      if (!quiet) console.info(`→ מריץ ${file}`);
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into app.schema_migrations (filename) values ($1)', [file]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw new Error(`כשל ב-${file}: ${error.message}`);
      }
    }
    if (!quiet) console.info('✓ כל ה-migrations הורצו');
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await runMigrations({ local: isLocal });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
