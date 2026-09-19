#!/usr/bin/env node
/**
 * ייבוא מבוקר של קטלוג המזיקים (נספח א׳) או של מאגר התכשירים, מ-CSV מאומת.
 *
 * למה דרך סקריפט ולא רשימה מוטבעת בקוד: אין להסתמך על רשימה בקוד כמידע
 * עדכני. כל שורה שנטענת חייבת לשאת מקור מידע ותאריך אימות, והסקריפט
 * מסרב לטעון בלעדיהם.
 *
 * שימוש:
 *   node scripts/import-catalog.mjs pests    --file annex-a.csv  --org <uuid> \
 *        --source "נספח א׳ להוראות הרשם" --source-url <url> --verified-at 2026-09-01
 *   node scripts/import-catalog.mjs products --file products.csv --org <uuid> \
 *        --source "מאגר התכשירים הרשמי" --verified-at 2026-09-01
 *   ...  --dry-run     # הצגת מה ייטען, בלי לכתוב
 *
 * עמודות ל-pests:    code,name_he[,name_scientific,group_name,source_name,source_url,verified_at]
 * עמודות ל-products: trade_name,active_ingredient_name,active_ingredient_concentration_percent,
 *                    registration_status[,ready_to_use,registration_number,label_url,valid_until,
 *                    approved_pests,approved_application_methods,source_name,source_url,verified_at]
 * (רשימות מופרדות ב-";")
 */
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { csvToRecords } from './csv.mjs';

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

const VALID_REGISTRATION_STATUS = new Set(['registered', 'expired', 'revoked', 'unknown']);

function requireValue(value, message) {
  if (!value || String(value).trim().length === 0) throw new Error(message);
  return String(value).trim();
}

function normalizeDate(value, label) {
  const text = requireValue(value, `${label} — חסר`);
  const parsed = new Date(text.length === 10 ? `${text}T00:00:00Z` : text);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} — תאריך לא תקין: ${text}`);
  return parsed.toISOString();
}

function splitList(value) {
  return String(value ?? '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildPestRows(records, defaults) {
  return records.map((record, index) => {
    const line = index + 2;
    return {
      code: requireValue(record.code, `שורה ${line}: code חסר`),
      name_he: requireValue(record.name_he, `שורה ${line}: name_he חסר`),
      name_scientific: record.name_scientific || null,
      group_name: record.group_name || null,
      source_name: requireValue(
        record.source_name || defaults.source,
        `שורה ${line}: חסר source_name (אפשר להעביר --source)`,
      ),
      source_url: record.source_url || defaults.sourceUrl || null,
      verified_at: normalizeDate(record.verified_at || defaults.verifiedAt, `שורה ${line}: verified_at`),
    };
  });
}

export function buildProductRows(records, defaults) {
  return records.map((record, index) => {
    const line = index + 2;
    const status = (record.registration_status || 'unknown').trim();
    if (!VALID_REGISTRATION_STATUS.has(status)) {
      throw new Error(
        `שורה ${line}: registration_status לא תקין "${status}". מותר: ${[...VALID_REGISTRATION_STATUS].join(', ')}`,
      );
    }
    const concentration = Number(record.active_ingredient_concentration_percent);
    if (!Number.isFinite(concentration) || concentration <= 0 || concentration > 100) {
      throw new Error(`שורה ${line}: ריכוז החומר הפעיל חייב להיות מספר בין 0 ל-100`);
    }
    return {
      trade_name: requireValue(record.trade_name, `שורה ${line}: trade_name חסר`),
      active_ingredient_name: requireValue(record.active_ingredient_name, `שורה ${line}: active_ingredient_name חסר`),
      active_ingredient_concentration_percent: concentration,
      ready_to_use: ['true', '1', 'כן', 'yes'].includes(String(record.ready_to_use ?? '').toLowerCase()),
      registration_status: status,
      registration_number: record.registration_number || null,
      label_url: record.label_url || null,
      valid_until: record.valid_until ? record.valid_until.slice(0, 10) : null,
      approved_pests: splitList(record.approved_pests),
      approved_application_methods: splitList(record.approved_application_methods),
      source_name: requireValue(
        record.source_name || defaults.source,
        `שורה ${line}: חסר source_name (אפשר להעביר --source)`,
      ),
      source_url: record.source_url || defaults.sourceUrl || null,
      verified_at: normalizeDate(record.verified_at || defaults.verifiedAt, `שורה ${line}: verified_at`),
    };
  });
}

async function main() {
  const kind = process.argv[2];
  if (kind !== 'pests' && kind !== 'products') {
    console.error('יש לציין סוג ייבוא: pests או products');
    process.exit(1);
  }

  const file = requireValue(arg('file'), 'חסר --file');
  const orgId = requireValue(arg('org'), 'חסר --org (מזהה הארגון)');
  const connectionString = arg('url') ?? process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
  if (!connectionString) throw new Error('חסרה כתובת מסד נתונים (--url או DATABASE_URL)');

  const defaults = {
    source: arg('source'),
    sourceUrl: arg('source-url'),
    verifiedAt: arg('verified-at'),
  };
  const dryRun = process.argv.includes('--dry-run');

  const records = csvToRecords(await readFile(file, 'utf8'));
  if (records.length === 0) throw new Error('הקובץ ריק או שאין בו שורות נתונים');

  const rows = kind === 'pests' ? buildPestRows(records, defaults) : buildProductRows(records, defaults);

  console.info(`נמצאו ${rows.length} שורות תקינות לייבוא (${kind}).`);
  console.info('דוגמה:', JSON.stringify(rows[0], null, 2));

  if (dryRun) {
    console.info('--dry-run: לא נכתב דבר למסד.');
    return;
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query('begin');

    if (kind === 'pests') {
      for (const row of rows) {
        await client.query(
          `insert into public.pest_catalog
             (organization_id, code, name_he, name_scientific, group_name, source_name, source_url, verified_at, is_active)
           values ($1,$2,$3,$4,$5,$6,$7,$8,true)
           on conflict (organization_id, code) do update set
             name_he = excluded.name_he,
             name_scientific = excluded.name_scientific,
             group_name = excluded.group_name,
             source_name = excluded.source_name,
             source_url = excluded.source_url,
             verified_at = excluded.verified_at,
             is_active = true`,
          [orgId, row.code, row.name_he, row.name_scientific, row.group_name, row.source_name, row.source_url, row.verified_at],
        );
      }
    } else {
      for (const row of rows) {
        await client.query(
          `insert into public.products
             (organization_id, trade_name, active_ingredient_name, active_ingredient_concentration_percent,
              ready_to_use, registration_status, registration_number, label_url, valid_until,
              approved_pests, approved_application_methods, source_name, source_url, verified_at, is_active)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true)
           on conflict (organization_id, trade_name, active_ingredient_name) do update set
             active_ingredient_concentration_percent = excluded.active_ingredient_concentration_percent,
             ready_to_use = excluded.ready_to_use,
             registration_status = excluded.registration_status,
             registration_number = excluded.registration_number,
             label_url = excluded.label_url,
             valid_until = excluded.valid_until,
             approved_pests = excluded.approved_pests,
             approved_application_methods = excluded.approved_application_methods,
             source_name = excluded.source_name,
             source_url = excluded.source_url,
             verified_at = excluded.verified_at,
             is_active = true`,
          [
            orgId, row.trade_name, row.active_ingredient_name, row.active_ingredient_concentration_percent,
            row.ready_to_use, row.registration_status, row.registration_number, row.label_url, row.valid_until,
            row.approved_pests, row.approved_application_methods, row.source_name, row.source_url, row.verified_at,
          ],
        );
      }
    }

    await client.query('commit');
    console.info(`✓ יובאו ${rows.length} שורות.`);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`הייבוא נכשל: ${error.message}`);
    process.exit(1);
  });
}
