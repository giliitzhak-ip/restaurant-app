#!/usr/bin/env node
/** מריץ את supabase/seed.sql. הנתונים בדיוניים בלבד. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(here, '..', 'supabase', 'seed.sql');

export async function runSeed({ connectionString, quiet = false } = {}) {
  const conn =
    connectionString ??
    process.argv.find((a) => a.startsWith('--url='))?.slice('--url='.length) ??
    process.env.DATABASE_URL ??
    process.env.TEST_DATABASE_URL;
  if (!conn) throw new Error('חסרה כתובת מסד נתונים.');

  const client = new pg.Client({ connectionString: conn });
  await client.connect();
  try {
    const sql = await readFile(seedPath, 'utf8');
    await client.query(sql);
    if (!quiet) console.info('✓ נתוני הדוגמה נטענו');
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runSeed();
}
