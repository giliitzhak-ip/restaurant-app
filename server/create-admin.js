/**
 * יצירת מנהל מערכת (אתה). הרצה:
 *   node server/create-admin.js <email> <password> [שם]
 *
 * הסיסמה אינה נשמרת בקוד ואינה נרשמת ללוג – רק הגיבוב שלה נשמר במסד.
 * אם המשתמש כבר קיים, הסיסמה שלו מתעדכנת וכל ההתחברויות הקיימות מנותקות.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword, isValidEmail, normalizeEmail, passwordProblems } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'pest-journal.db');

const [, , emailArg, passwordArg, ...nameParts] = process.argv;
const name = nameParts.join(' ') || 'מנהל מערכת';

if (!emailArg || !passwordArg) {
  console.error('שימוש: node server/create-admin.js <email> <password> [שם]');
  process.exit(1);
}

const email = normalizeEmail(emailArg);
const problems = [];
if (!isValidEmail(email)) problems.push('כתובת הדוא״ל אינה תקינה.');
problems.push(...passwordProblems(passwordArg));
if (problems.length) {
  console.error('לא ניתן ליצור מנהל מערכת:');
  for (const p of problems) console.error(' - ' + p);
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
db.exec(fs.readFileSync(path.join(__dirname, 'tenancy.sql'), 'utf8'));

const { hash, salt } = hashPassword(passwordArg);
const now = new Date().toISOString();
const existing = db.prepare('SELECT id FROM app_users WHERE email_normalized = ?').get(email);

if (existing) {
  db.prepare(`UPDATE app_users
    SET password_hash = ?, password_salt = ?, name = ?, is_super_admin = 1, status = 'active'
    WHERE id = ?`).run(hash, salt, name, existing.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(existing.id);
  console.log(`עודכן מנהל מערכת קיים: ${email}`);
} else {
  const id = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  db.prepare(`INSERT INTO app_users
    (id, org_id, email, email_normalized, password_hash, password_salt, name, role,
     is_super_admin, status, created_at)
    VALUES (?, NULL, ?, ?, ?, ?, ?, 'owner', 1, 'active', ?)`)
    .run(id, emailArg.trim(), email, hash, salt, name, now);
  console.log(`נוצר מנהל מערכת: ${email}`);
}

db.prepare('DELETE FROM login_attempts WHERE key = ?').run(email);
console.log('אפשר להתחבר עכשיו. הסיסמה לא נשמרה בקובץ כלשהו.');
