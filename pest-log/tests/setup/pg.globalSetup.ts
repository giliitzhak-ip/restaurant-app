/**
 * הכנה לבדיקות האינטגרציה וה-RLS: מפעיל Postgres מקומי, מריץ migrations
 * ו-seed על מסד נקי. זה לא מוק — הבדיקות רצות מול Postgres אמיתי, אחרת
 * אין שום משמעות לבדיקת RLS.
 */
import pg from 'pg';
import { start, TEST_DATABASE_URL } from '../../scripts/local-db.mjs';
import { runMigrations } from '../../scripts/migrate.mjs';
import { runSeed } from '../../scripts/seed.mjs';

export default async function setup(): Promise<void> {
  start();
  process.env.TEST_DATABASE_URL = TEST_DATABASE_URL;

  // מסד נקי בכל הרצה — כדי שהבדיקות יהיו דטרמיניסטיות וש-migrations
  // ייבדקו על סביבה ריקה.
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query('drop schema if exists public cascade');
    await client.query('drop schema if exists app cascade');
    await client.query('drop schema if exists auth cascade');
    await client.query('create schema public');
  } finally {
    await client.end();
  }

  await runMigrations({ connectionString: TEST_DATABASE_URL, local: true, quiet: true });
  await runSeed({ connectionString: TEST_DATABASE_URL, quiet: true });
}
