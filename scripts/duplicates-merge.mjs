/**
 * מיזוג שני לקוחות שהתגלו ככפילות. ברירת המחדל היא הדמיה בלבד.
 *
 *   node scripts/duplicates-merge.mjs --keep <id> --merge <id>            # הדמיה
 *   node scripts/duplicates-merge.mjs --keep <id> --merge <id> --apply    # ביצוע
 *
 * מה שנעשה בביצוע:
 *   1. גיבוי מלא של מסד הנתונים (VACUUM INTO).
 *   2. העברת כל ההפניות ללקוח שנשמר.
 *   3. סימון הלקוח המיותר כמאורכב, עם הערה שמפנה ללקוח שנשמר.
 *   4. רשומת ביקורת לכל שינוי.
 *
 * שום רשומה אינה נמחקת, ולכן אפשר לחזור אחורה גם בלי הגיבוי.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { planCustomerMerge } from './lib/mergeCustomers.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const apply = args.includes('--apply');
const keepId = flag('--keep');
const mergeId = flag('--merge');
const dbPath = flag('--db', path.join(process.cwd(), 'data', 'pest-journal.db'));

if (!keepId || !mergeId) {
  console.error('חסר --keep או --merge. יש להריץ קודם: npm run duplicates');
  process.exit(2);
}
if (!fs.existsSync(dbPath)) {
  console.error(`לא נמצא מסד נתונים: ${dbPath}`);
  process.exit(2);
}

const db = new DatabaseSync(dbPath);
const rows = db.prepare(
  'SELECT entity, entity_id, payload, org_id FROM sync_documents WHERE deleted_at IS NULL',
).all();
const docs = rows.map((r) => ({
  entity: r.entity,
  entityId: r.entity_id,
  orgId: r.org_id,
  payload: JSON.parse(r.payload),
}));

const plan = planCustomerMerge(docs, keepId, mergeId);
if (!plan.ok) {
  console.error('המיזוג לא תוכנן:');
  for (const e of plan.errors) console.error(`  • ${e}`);
  process.exit(1);
}

console.log(`\nלקוח שיישמר:  ${plan.keep.name} (${plan.keep.entityId})`);
console.log(`לקוח שימוזג:  ${plan.merged.name} (${plan.merged.entityId})`);
console.log(`\nשדות שיושלמו אצל הלקוח שנשמר: ${plan.filled.length ? plan.filled.join(', ') : 'אין'}`);
if (plan.conflicts.length) {
  console.log('הבדלים שיישמרו כהערה (ולא יידרסו):');
  for (const c of plan.conflicts) console.log(`  • ${c.field}: "${c.keep}" ← נוסף "${c.merged}"`);
}
console.log(`\nהפניות שיועברו: ${plan.moves.length}`);
const byEntity = {};
for (const m of plan.moves) byEntity[m.entity] = (byEntity[m.entity] ?? 0) + 1;
for (const [entity, n] of Object.entries(byEntity)) console.log(`  • ${entity}: ${n}`);

if (!apply) {
  console.log('\nהדמיה בלבד. שום דבר לא שונה. להרצה אמיתית יש להוסיף --apply.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(path.dirname(dbPath), `pest-journal.${stamp}.before-merge.bak.db`);
db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
console.log(`\nגיבוי לפני המיזוג: ${backup}`);

const update = db.prepare(
  'UPDATE sync_documents SET payload = ?, received_at = ? WHERE entity = ? AND entity_id = ?',
);
const audit = db.prepare(`
  INSERT INTO audit_log (id, entity, entity_id, action, field, before, after, user_id, user_name, at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const now = new Date().toISOString();
const beforeById = new Map(docs.map((d) => [`${d.entity}|${d.entityId}`, d.payload]));

db.exec('BEGIN IMMEDIATE');
try {
  for (const target of [plan.keep, plan.merged]) {
    update.run(JSON.stringify(target.payload), now, 'customers', target.entityId);
    audit.run(
      crypto.randomUUID(), 'customers', target.entityId, 'merge', 'customer',
      JSON.stringify(beforeById.get(`customers|${target.entityId}`)).slice(0, 2000),
      JSON.stringify(target.payload).slice(0, 2000),
      null, 'duplicates-merge', now,
    );
  }
  for (const move of plan.moves) {
    update.run(JSON.stringify(move.payload), now, move.entity, move.entityId);
    audit.run(
      crypto.randomUUID(), move.entity, move.entityId, 'merge', move.field,
      move.from, move.to, null, 'duplicates-merge', now,
    );
  }
  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  console.error(`המיזוג נכשל ובוטל במלואו: ${err.message}`);
  process.exit(1);
}

console.log(`\nבוצע. ${plan.moves.length} הפניות הועברו, והלקוח המיותר סומן כמאורכב.`);
console.log('הלקוח לא נמחק. לביטול: שחזור מהגיבוי, או הסרת הסימון וההחזרה של ההפניות לפי יומן הביקורת.');
