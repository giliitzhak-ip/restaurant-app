/**
 * דוח כפילויות. קורא בלבד – אינו מוחק, אינו מאחד ואינו משנה נתונים.
 *
 *   node scripts/duplicates-report.mjs                      # מסד השרת שב-./data
 *   node scripts/duplicates-report.mjs --db /path/to.db
 *   node scripts/duplicates-report.mjs --backup גיבוי.json
 *   node scripts/duplicates-report.mjs --json out.json
 *
 * לפני קריאה ממסד נתונים נוצר גיבוי (VACUUM INTO), כדי שגם בדיקה
 * לא תישען על קובץ יחיד.
 */

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { LEVEL_LABEL, findDuplicates, summarize } from './lib/duplicates.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const ENTITY_TO_COLLECTION = {
  customers: 'customers',
  customer_sites: 'sites',
  journals: 'journals',
  journal_pests: 'journalPests',
  journal_actions: 'journalActions',
  journal_materials: 'journalMaterials',
  materials: 'materials',
  material_labels: 'materialLabels',
  treatment_templates: 'treatmentTemplates',
  customer_templates: 'customerTemplates',
  routes: 'routes',
  route_stops: 'routeStops',
  tasks: 'tasks',
  bait_stations: 'baitStations',
  signatures: 'signatures',
  attachments: 'attachments',
  journal_snapshots: 'journalSnapshots',
};

/** קורא את מסד השרת לפי עסק, כדי שכפילות תיבדק בתוך עסק ולא בין עסקים. */
function readFromDatabase(dbPath) {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`לא נמצא מסד נתונים: ${dbPath}`);
  }
  const db = new DatabaseSync(dbPath);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(path.dirname(dbPath), `pest-journal.${stamp}.before-report.bak.db`);
  try {
    db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
    console.log(`גיבוי לפני הדוח: ${backup}`);
  } catch (err) {
    console.log(`אזהרה: הגיבוי לא נוצר (${err.message}). הדוח קורא בלבד וממשיך.`);
  }

  const rows = db.prepare(
    `SELECT entity, entity_id, payload, org_id FROM sync_documents WHERE deleted_at IS NULL`,
  ).all();

  const orgs = new Map();
  const orgNames = new Map();
  try {
    for (const o of db.prepare('SELECT id, name FROM organizations').all()) {
      orgNames.set(o.id, o.name);
    }
  } catch {
    /* מסד ללא טבלת עסקים */
  }

  for (const row of rows) {
    const collection = ENTITY_TO_COLLECTION[row.entity];
    if (!collection) continue;
    const org = row.org_id ?? '(ללא עסק)';
    if (!orgs.has(org)) orgs.set(org, {});
    const data = orgs.get(org);
    (data[collection] ??= []).push({ id: row.entity_id, ...JSON.parse(row.payload) });
  }

  return [...orgs.entries()].map(([org, data]) => ({
    scope: orgNames.get(org) ?? org,
    data,
  }));
}

function readFromBackup(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const data = parsed.state ?? parsed;
  return [{ scope: `גיבוי ${path.basename(file)}`, data }];
}

const scopes = args.includes('--backup')
  ? readFromBackup(flag('--backup'))
  : readFromDatabase(flag('--db', path.join(process.cwd(), 'data', 'pest-journal.db')));

const report = [];
let certainTotal = 0;

for (const { scope, data } of scopes) {
  const findings = findDuplicates(data);
  const stats = summarize(findings);
  certainTotal += stats.byLevel.certain;
  report.push({ scope, stats, findings });

  const counts = Object.entries(data)
    .map(([k, v]) => `${k}=${v.length}`)
    .join(' ');
  console.log(`\n══════ ${scope} ══════`);
  console.log(`רשומות: ${counts || 'אין'}`);
  if (findings.length === 0) {
    console.log('לא נמצאו כפילויות.');
    continue;
  }
  console.log(
    `ממצאים: ${stats.total} · ודאיות ${stats.byLevel.certain}`
    + ` · אפשריות ${stats.byLevel.possible} · נפרדות ${stats.byLevel.separate}`,
  );
  for (const f of findings) {
    console.log(`\n[${LEVEL_LABEL[f.level]}] ${f.kind} · ${f.title}`);
    console.log(`  סיבה: ${f.why}`);
    for (const r of f.rows) {
      const fields = Object.entries(r)
        .filter(([k]) => k !== 'id')
        .map(([k, v]) => `${k}=${v ?? '—'}`)
        .join(' · ');
      console.log(`  • ${r.id} · ${fields}`);
    }
  }
}

const out = flag('--json');
if (out) {
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2));
  console.log(`\nדוח מלא נשמר ב-${out}`);
}

console.log(
  `\nסיכום: ${certainTotal} כפילויות ודאיות.`
  + ' הדוח אינו מוחק ואינו מאחד דבר – כל טיפול נעשה בנפרד ובאישור.',
);
