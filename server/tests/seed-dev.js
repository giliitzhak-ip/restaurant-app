/**
 * זריעת חשבונות לפיתוח ולבדיקות הדפדפן. אידמפוטנטי.
 *   node server/tests/seed-dev.js
 *
 * יוצר מנהל מערכת, ועסק מאושר עם בעלים ועובד.
 * הסיסמאות כאן הן לפיתוח בלבד ואין להשתמש בהן בסביבה אמיתית.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword, normalizeEmail } from '../auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'pest-journal.db');

export const DEV_ACCOUNTS = {
  admin: { email: 'admin@dev.local', password: 'DevAdmin123', name: 'מנהל מערכת' },
  owner: { email: 'yizhak@dev.local', password: 'DevOwner123', name: 'יצחק' },
  worker: { email: 'worker@dev.local', password: 'DevWorker123', name: 'עובד שטח' },
  orgName: 'יצחק הדברות',
};

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));
db.exec(fs.readFileSync(path.join(__dirname, '..', 'tenancy.sql'), 'utf8'));

const now = new Date().toISOString();
const id = (p) => `${p}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

function upsertUser({ email, password, name }, { orgId = null, role = 'owner', superAdmin = false }) {
  const normalized = normalizeEmail(email);
  const { hash, salt } = hashPassword(password);
  const existing = db.prepare('SELECT id FROM app_users WHERE email_normalized = ?').get(normalized);
  if (existing) {
    db.prepare(`UPDATE app_users SET password_hash = ?, password_salt = ?, name = ?,
      org_id = ?, role = ?, is_super_admin = ?, status = 'active' WHERE id = ?`)
      .run(hash, salt, name, orgId, role, superAdmin ? 1 : 0, existing.id);
    return existing.id;
  }
  const userId = id('usr');
  db.prepare(`INSERT INTO app_users
    (id, org_id, email, email_normalized, password_hash, password_salt, name, role,
     is_super_admin, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`)
    .run(userId, orgId, email, normalized, hash, salt, name, role, superAdmin ? 1 : 0, now);
  return userId;
}

// עסק מאושר עם מנוי בתוקף
let org = db.prepare('SELECT * FROM organizations WHERE name = ?').get(DEV_ACCOUNTS.orgName);
if (!org) {
  const orgId = id('org');
  db.prepare(`INSERT INTO organizations
    (id, name, contact_name, phone, email, license_number, status, plan, paid_until, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'approved', 'basic', '2099-12-31', ?)`)
    .run(orgId, DEV_ACCOUNTS.orgName, 'יצחק', '050-0000000', DEV_ACCOUNTS.owner.email, '12345', now);
  org = { id: orgId };
} else {
  db.prepare("UPDATE organizations SET status = 'approved', paid_until = '2099-12-31' WHERE id = ?")
    .run(org.id);
}

upsertUser(DEV_ACCOUNTS.admin, { superAdmin: true });
upsertUser(DEV_ACCOUNTS.owner, { orgId: org.id, role: 'owner' });
upsertUser(DEV_ACCOUNTS.worker, { orgId: org.id, role: 'field' });
db.exec('DELETE FROM login_attempts');

console.log('נזרעו חשבונות פיתוח:');
console.log(`  מנהל מערכת: ${DEV_ACCOUNTS.admin.email} / ${DEV_ACCOUNTS.admin.password}`);
console.log(`  בעל עסק:    ${DEV_ACCOUNTS.owner.email} / ${DEV_ACCOUNTS.owner.password}`);
console.log(`  עובד שטח:   ${DEV_ACCOUNTS.worker.email} / ${DEV_ACCOUNTS.worker.password}`);
