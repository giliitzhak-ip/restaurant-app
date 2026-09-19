#!/usr/bin/env node
/**
 * ייצוא מלא של יומני ארגון: JSON, CSV וקובצי ה-PDF.
 *
 * שימוש:
 *   node scripts/export.mjs --org <uuid> --out ./export [--url postgres://...]
 *   node scripts/export.mjs --org <uuid> --out ./export --with-files
 *
 * --with-files מוריד גם את הקבצים מה-Storage, ודורש
 * SUPABASE_URL ו-SUPABASE_SERVICE_ROLE_KEY.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

function arg(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const withEquals = process.argv.find((a) => a.startsWith(prefix));
  if (withEquals) return withEquals.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    return process.argv[index + 1];
  }
  return fallback;
}

/** ממיר שורות ל-CSV עם escaping תקין. */
export function toCsv(rows) {
  if (rows.length === 0) return '';
  const keys = Object.keys(rows[0]);
  const escape = (value) => {
    if (value === null || value === undefined) return '';
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [keys.join(','), ...rows.map((row) => keys.map((key) => escape(row[key])).join(','))].join('\n');
}

const EXPORT_TABLES = [
  'organizations',
  'profiles',
  'pesticide_licenses',
  'clients',
  'client_sites',
  'products',
  'pest_catalog',
  'warning_templates',
  'pest_logs',
  'pest_findings',
  'prevention_actions',
  'pesticide_applications',
  'assistant_exterminators',
  'bait_stations',
  'attachments',
  'signatures',
  'audit_events',
  'sync_operations',
];

async function main() {
  const orgId = arg('org');
  const outDir = arg('out', './export');
  const connectionString = arg('url') ?? process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
  const withFiles = process.argv.includes('--with-files');

  if (!orgId) throw new Error('חסר --org (מזהה הארגון)');
  if (!connectionString) throw new Error('חסרה כתובת מסד נתונים (--url או DATABASE_URL)');

  await mkdir(outDir, { recursive: true });
  await mkdir(path.join(outDir, 'csv'), { recursive: true });

  const client = new pg.Client({ connectionString });
  await client.connect();

  const summary = { organizationId: orgId, exportedAt: new Date().toISOString(), tables: {} };

  try {
    for (const table of EXPORT_TABLES) {
      // organizations מסוננת לפי id; בשאר הטבלאות לפי organization_id.
      const column = table === 'organizations' ? 'id' : 'organization_id';
      const result = await client.query(`select * from public.${table} where ${column} = $1`, [orgId]);
      await writeFile(
        path.join(outDir, 'csv', `${table}.csv`),
        toCsv(result.rows),
        'utf8',
      );
      summary.tables[table] = result.rowCount;
      console.info(`  ${table}: ${result.rowCount} שורות`);
    }

    // היומנים ב-JSON, כולל ה-snapshot וה-hash — זה העותק הקובע.
    const logs = await client.query(
      `select id, serial_number, status, document_version, document_hash, completed_at,
              cancelled_at, cancellation_reason, corrects_log_id, correction_reason,
              root_log_id, created_at, updated_at, deleted_at, content, snapshot
         from public.pest_logs
        where organization_id = $1
        order by serial_number nulls last, created_at`,
      [orgId],
    );
    await writeFile(path.join(outDir, 'pest-logs.json'), JSON.stringify(logs.rows, null, 2), 'utf8');

    const files = await client.query(
      `select id, pest_log_id, kind, storage_bucket, storage_path, mime_type, size_bytes, sha256, document_version
         from public.attachments
        where organization_id = $1 and deleted_at is null`,
      [orgId],
    );
    await writeFile(path.join(outDir, 'attachments.json'), JSON.stringify(files.rows, null, 2), 'utf8');

    if (withFiles) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceKey) {
        throw new Error('--with-files דורש SUPABASE_URL ו-SUPABASE_SERVICE_ROLE_KEY');
      }
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
      await mkdir(path.join(outDir, 'files'), { recursive: true });

      let downloaded = 0;
      for (const file of files.rows) {
        const { data, error } = await supabase.storage.from(file.storage_bucket).download(file.storage_path);
        if (error || !data) {
          console.warn(`  ⚠ לא הורד: ${file.storage_path} (${error?.message ?? 'שגיאה'})`);
          continue;
        }
        const target = path.join(outDir, 'files', file.storage_path.replace(/[/\\]/g, '__'));
        await writeFile(target, Buffer.from(await data.arrayBuffer()));
        downloaded += 1;
      }
      summary.filesDownloaded = downloaded;
      console.info(`  קבצים שהורדו: ${downloaded} מתוך ${files.rowCount}`);
    } else {
      console.info('  (ללא קבצים — יש להוסיף --with-files כדי להוריד גם את ה-PDF והתמונות)');
    }

    await writeFile(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
    console.info(`✓ הייצוא הושלם אל ${outDir}`);
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`הייצוא נכשל: ${error.message}`);
    process.exit(1);
  });
}
