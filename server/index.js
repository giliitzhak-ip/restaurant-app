/**
 * שרת "יומן הדברה – יצחק הדברות".
 * Node.js v22+ עם node:sqlite, ללא תלויות חיצוניות.
 *
 *   npm run build && npm start
 *
 * השרת מגיש את האפליקציה הבנויה (dist/) וחושף API לסנכרון עם ולידציה בצד שרת.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { validatePayload, isDeletionAllowed, deletionRefusal } from './validate.js';
import { createAuthRoutes } from './routes-auth.js';
import { createDocLinkRoutes } from './routes-doclinks.js';
import { ACCESS, organizationAccess } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'pest-journal.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
db.exec(fs.readFileSync(path.join(__dirname, 'tenancy.sql'), 'utf8'));

/**
 * טבלת הסנכרון הגולמית: כל ישות נשמרת גם כמסמך JSON מלא.
 * כך שום נתון שדווח מהשטח אינו אובד גם אם הסכימה תתפתח.
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS sync_documents (
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    received_at TEXT NOT NULL,
    PRIMARY KEY (entity, entity_id)
  );
  CREATE INDEX IF NOT EXISTS idx_sync_entity ON sync_documents(entity);
`);

/* כל מסמך שייך לעסק. מסמך ללא בעלים אינו נגיש לאיש. */
const syncColumns = db.prepare('PRAGMA table_info(sync_documents)').all().map((c) => c.name);

/* עמודות שנוספו אחרי הגרסה הראשונה. ההוספה היא תוספתית בלבד:
   אין מחיקת עמודה, אין שינוי טיפוס ואין כתיבה מחדש של נתונים קיימים. */
const syncMigrations = [
  ['org_id', 'ALTER TABLE sync_documents ADD COLUMN org_id TEXT'],
  ['updated_by', 'ALTER TABLE sync_documents ADD COLUMN updated_by TEXT'],
  // deleted_at: מצבה (tombstone). מסמך שנמחק נשאר בטבלה עם חותמת זמן,
  // כך שהמחיקה מתועדת וניתן לשחזר את הנתון מתוך payload.
  ['deleted_at', 'ALTER TABLE sync_documents ADD COLUMN deleted_at TEXT'],
  // last_op_id: מזהה הפעולה האחרונה שהוחלה על המסמך. שליחה חוזרת של
  // אותה פעולה (למשל אחרי שהתשובה אבדה ברשת) אינה נכתבת ואינה מתועדת שוב.
  ['last_op_id', 'ALTER TABLE sync_documents ADD COLUMN last_op_id TEXT'],
];
const pendingMigrations = syncMigrations.filter(([col]) => !syncColumns.includes(col));

/** גיבוי קובץ המסד לפני שינוי מבנה, כדי שכשל מיגרציה לא יאבד נתונים. */
function backupDatabase(reason) {
  try {
    if (!fs.existsSync(DB_PATH) || fs.statSync(DB_PATH).size === 0) return null;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(DATA_DIR, `pest-journal.${stamp}.${reason}.bak.db`);
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
    console.log(`גיבוי לפני מיגרציה: ${target}`);
    return target;
  } catch (err) {
    console.error(`גיבוי לפני מיגרציה נכשל: ${err.message}`);
    return null;
  }
}

if (pendingMigrations.length > 0) {
  backupDatabase('pre-migration');
  for (const [, sql] of pendingMigrations) db.exec(sql);
}
db.exec('CREATE INDEX IF NOT EXISTS idx_sync_org ON sync_documents(org_id, entity)');

const auth = createAuthRoutes(db);
const docLinks = createDocLinkRoutes(db);

const ALLOWED_ENTITIES = new Set([
  'exterminators', 'customers', 'customer_sites', 'journals', 'journal_pests',
  'journal_actions', 'journal_materials', 'materials', 'material_labels',
  'treatment_templates', 'customer_templates', 'routes', 'route_stops', 'tasks',
  'bait_stations', 'signatures', 'attachments', 'journal_snapshots', 'audit_log',
]);

const MAX_BODY = 8 * 1024 * 1024;

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('גוף הבקשה גדול מדי'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('JSON לא תקין'));
      }
    });
    req.on('error', reject);
  });
}

const upsertDoc = db.prepare(`
  INSERT INTO sync_documents
    (entity, entity_id, payload, received_at, org_id, updated_by, deleted_at, last_op_id)
  VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
  ON CONFLICT(entity, entity_id) DO UPDATE SET
    payload = excluded.payload, received_at = excluded.received_at,
    updated_by = excluded.updated_by, deleted_at = NULL, last_op_id = excluded.last_op_id
`);
/** מחיקה מסומנת ואינה מוחקת את ה-payload: הראיה נשמרת לביקורת. */
const tombstoneDoc = db.prepare(`
  UPDATE sync_documents SET deleted_at = ?, received_at = ?, updated_by = ?, last_op_id = ?
  WHERE entity = ? AND entity_id = ?
`);
const selectDoc = db.prepare(
  `SELECT payload, org_id, deleted_at, last_op_id
   FROM sync_documents WHERE entity = ? AND entity_id = ?`,
);
const selectByEntity = db.prepare(
  `SELECT entity_id, payload FROM sync_documents
   WHERE entity = ? AND org_id = ? AND deleted_at IS NULL
   ORDER BY received_at DESC LIMIT ?`,
);
const insertAudit = db.prepare(`
  INSERT INTO audit_log (id, entity, entity_id, action, field, before, after, user_id, user_name, at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
/* משיכה: כל מה שהשתנה בעסק מאז חותמת זמן, כולל מצבות של רשומות שנמחקו,
   כדי שמחיקה במכשיר אחד תגיע גם למכשירים האחרים. */
const selectChanged = db.prepare(
  `SELECT entity, entity_id, payload, received_at, deleted_at
   FROM sync_documents
   WHERE org_id = ? AND received_at > ?
   ORDER BY received_at ASC
   LIMIT ?`,
);

const PULL_LIMIT = 2000;

/** GET /api/sync/pull?since=<iso> – שינויים מהשרת למכשיר. */
function handlePull(url, res, session) {
  if (!session.user.org_id) {
    return json(res, 403, { ok: false, errors: ['למשתמש זה אין עסק משויך.'] });
  }
  // קריאה מותרת גם כשהכתיבה חסומה (מנוי שפג), כדי שלא ייאבד מידע מהמכשיר
  const access = organizationAccess(session.org);
  if (access.level === ACCESS.NONE) {
    return json(res, 403, { ok: false, errors: [access.reason], access: access.level });
  }

  const since = url.searchParams.get('since') || '';
  const limit = Math.min(Number(url.searchParams.get('limit')) || PULL_LIMIT, PULL_LIMIT);
  const rows = selectChanged.all(session.user.org_id, since, limit + 1);
  const truncated = rows.length > limit;
  const page = truncated ? rows.slice(0, limit) : rows;

  const items = {};
  const deleted = {};
  for (const row of page) {
    if (!ALLOWED_ENTITIES.has(row.entity)) continue;
    if (row.deleted_at) {
      (deleted[row.entity] ??= []).push(row.entity_id);
    } else {
      (items[row.entity] ??= []).push({ id: row.entity_id, ...JSON.parse(row.payload) });
    }
  }

  /* הסמן הוא חותמת הרשומה האחרונה שנשלחה בפועל. בדף חלקי הוא נשאר
     מאחור בכוונה, כדי שהמשיכה הבאה תמשיך בדיוק מאותה נקודה. */
  const cursor = page.length > 0 ? page[page.length - 1].received_at : since;
  return json(res, 200, { ok: true, items, deleted, cursor, truncated });
}

/** POST /api/sync – מקבל ישות בודדת מהתור של הלקוח. דורש התחברות. */
async function handleSync(req, res, session) {
  const body = await readBody(req);
  const { entity, entityId, payload } = body;
  const isDelete = body.deleted === true;
  const opId = typeof body.opId === 'string' ? body.opId : null;

  if (!session.user.org_id) {
    return json(res, 403, { ok: false, errors: ['למשתמש זה אין עסק משויך.'] });
  }
  const access = organizationAccess(session.org);
  if (access.level !== ACCESS.FULL) {
    return json(res, 403, { ok: false, errors: [access.reason], access: access.level });
  }

  if (!ALLOWED_ENTITIES.has(entity)) {
    return json(res, 400, { ok: false, errors: [`ישות לא מוכרת: ${entity}`] });
  }
  if (!entityId || typeof entityId !== 'string') {
    return json(res, 400, { ok: false, errors: ['entityId חסר או לא חוקי'] });
  }

  // מחיקה אינה נושאת payload, ולכן אינה עוברת ולידציית תוכן
  if (!isDelete) {
    const errors = validatePayload(entity, payload);
    if (errors.length > 0) {
      return json(res, 422, { ok: false, errors });
    }
  }

  const existingRow = selectDoc.get(entity, entityId);
  /* מסמך של עסק אחר לעולם אינו נכתב מחדש על ידי עסק אחר.
     התשובה היא 409 ולא 403 בכוונה: 403 אומר ללקוח "אין לך גישה
     בכלל" והתור ממתין, ואילו כאן הבעיה היא ברשומה אחת. 409 מוציא
     אותה מהתור אל רשימת הדחיות, ושאר הסנכרון ממשיך. */
  if (existingRow && existingRow.org_id && existingRow.org_id !== session.user.org_id) {
    return json(res, 409, { ok: false, errors: ['הרשומה שייכת לעסק אחר.'] });
  }
  const existing = existingRow ? JSON.parse(existingRow.payload) : null;
  const now = new Date().toISOString();

  /* אותה פעולה בדיוק הוחלה כבר. קורה כשהתשובה אבדה ברשת והלקוח שלח שוב.
     מחזירים הצלחה בלי לכתוב שוב ובלי רשומת ביקורת כפולה. */
  if (opId && existingRow && existingRow.last_op_id === opId) {
    return json(res, 200, {
      ok: true, entity, entityId, duplicate: true,
      ...(isDelete ? { deleted: true } : {}),
      receivedAt: now,
    });
  }

  if (isDelete) {
    const refusal = deletionRefusal(entity, existing);
    if (refusal) {
      return json(res, 422, { ok: false, errors: [refusal] });
    }
    if (!existingRow) {
      // אין מה למחוק – המחיקה הושלמה מבחינת הלקוח, ואין להחזיר אותו לתור
      return json(res, 200, { ok: true, entity, entityId, deleted: true, receivedAt: now });
    }
    tombstoneDoc.run(now, now, session.user.id, opId, entity, entityId);
    insertAudit.run(
      crypto.randomUUID(), entity, entityId, 'delete', null,
      JSON.stringify(existing).slice(0, 2000), null,
      session.user.id, session.user.name, now,
    );
    return json(res, 200, { ok: true, entity, entityId, deleted: true, receivedAt: now });
  }

  if (!isDeletionAllowed(entity, existing) && payload.status === 'cancelled' && !payload.cancelledReason) {
    return json(res, 422, { ok: false, errors: ['ביטול יומן שהושלם מחייב סיבה מתועדת.'] });
  }

  upsertDoc.run(
    entity, entityId, JSON.stringify(payload), now,
    session.user.org_id, session.user.id, opId,
  );

  insertAudit.run(
    crypto.randomUUID(),
    entity,
    entityId,
    existing ? 'update' : 'create',
    null,
    existing ? JSON.stringify(existing).slice(0, 2000) : null,
    JSON.stringify(payload).slice(0, 2000),
    session.user.id,
    session.user.name,
    now,
  );

  return json(res, 200, { ok: true, entity, entityId, receivedAt: now });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  const filePath = path.join(DIST, pathname);
  // מניעת יציאה מחוץ לתיקיית ההגשה
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // ניתוב צד-לקוח: כל נתיב לא מוכר מקבל את מעטפת האפליקציה
      fs.readFile(path.join(DIST, 'index.html'), (err2, html) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('האפליקציה טרם נבנתה. יש להריץ: npm run build');
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(html);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=604800',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);

  if (url.pathname.startsWith('/api/')) {
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (url.pathname === '/api/health' && req.method === 'GET') {
      return json(res, 200, { ok: true, time: new Date().toISOString() });
    }

    /* ───── נתיבים פתוחים: הרשמה, התחברות ומסמך בקישור ───── */

    const send = (result) => json(res, result.status, result.body);

    /* מסמך בקישור ללקוח: בכוונה ללא התחברות, ולכן מוגן באסימון
       אקראי עם תוקף. מחזיר צילום של יומן שהושלם בלבד. */
    if (url.pathname.startsWith('/api/doc/') && req.method === 'GET') {
      const token = decodeURIComponent(url.pathname.slice('/api/doc/'.length));
      return send(docLinks.read(token));
    }

    /* הזמנה או איפוס סיסמה: העובד קובע סיסמה לפני שיש לו גישה,
       ולכן אין כאן התחברות. ההגנה היא באסימון חד-פעמי עם תוקף. */
    if (url.pathname.startsWith('/api/auth/invite/')) {
      const token = decodeURIComponent(url.pathname.slice('/api/auth/invite/'.length));
      if (req.method === 'GET') return send(auth.readInvite(token));
      if (req.method === 'POST') {
        return readBody(req)
          .then((body) => send(auth.acceptInvite(token, body)))
          .catch((err) => json(res, 400, { ok: false, errors: [err.message] }));
      }
    }

    if (url.pathname === '/api/auth/register' && req.method === 'POST') {
      return readBody(req)
        .then((body) => send(auth.register(body)))
        .catch((err) => json(res, 400, { ok: false, errors: [err.message] }));
    }

    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      return readBody(req)
        .then((body) => send(auth.login(body)))
        .catch((err) => json(res, 400, { ok: false, errors: [err.message] }));
    }

    /* ───── מכאן ואילך נדרשת התחברות ───── */

    const session = auth.currentUser(req);
    if (!session) {
      return json(res, 401, { ok: false, errors: ['נדרשת התחברות.'] });
    }

    if (url.pathname === '/api/auth/me' && req.method === 'GET') {
      return send(auth.me(session));
    }

    if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
      return send(auth.logout(session));
    }

    if (url.pathname === '/api/auth/users' && req.method === 'GET') {
      return send(auth.listEmployees(session));
    }

    if (url.pathname === '/api/auth/users/invite' && req.method === 'POST') {
      return readBody(req)
        .then((body) => send(auth.inviteEmployee(session, body)))
        .catch((err) => json(res, 400, { ok: false, errors: [err.message] }));
    }

    if (url.pathname.endsWith('/reset-password') && req.method === 'POST'
        && url.pathname.startsWith('/api/auth/users/')) {
      const targetId = decodeURIComponent(
        url.pathname.slice('/api/auth/users/'.length, -'/reset-password'.length),
      );
      return send(auth.resetEmployeePassword(session, targetId));
    }

    if (url.pathname.startsWith('/api/auth/users/') && req.method === 'PATCH') {
      const targetId = decodeURIComponent(url.pathname.split('/')[4] ?? '');
      return readBody(req)
        .then((body) => send(auth.updateEmployee(session, targetId, body)))
        .catch((err) => json(res, 400, { ok: false, errors: [err.message] }));
    }

    /* ───── קונסולת מנהל המערכת ───── */

    if (url.pathname === '/api/admin/organizations' && req.method === 'GET') {
      return send(auth.listOrganizations(session));
    }

    if (url.pathname.startsWith('/api/admin/organizations/') && req.method === 'POST') {
      const orgId = decodeURIComponent(url.pathname.split('/')[4] ?? '');
      return readBody(req)
        .then((body) => send(auth.decideOrganization(session, orgId, body)))
        .catch((err) => json(res, 400, { ok: false, errors: [err.message] }));
    }

    /* ───── נתוני העסק ───── */

    if (url.pathname === '/api/doc-links' && req.method === 'POST') {
      return readBody(req)
        .then((body) => send(docLinks.create(session, body)))
        .catch((err) => json(res, 400, { ok: false, errors: [err.message] }));
    }

    if (url.pathname === '/api/doc-links' && req.method === 'GET') {
      return send(docLinks.list(session, url.searchParams.get('journalId')));
    }

    if (url.pathname === '/api/doc-links/revoke' && req.method === 'POST') {
      return readBody(req)
        .then((body) => send(docLinks.revoke(session, body)))
        .catch((err) => json(res, 400, { ok: false, errors: [err.message] }));
    }

    if (url.pathname === '/api/sync/pull' && req.method === 'GET') {
      return handlePull(url, res, session);
    }

    if (url.pathname === '/api/sync' && req.method === 'POST') {
      return handleSync(req, res, session).catch((err) =>
        json(res, 400, { ok: false, errors: [err.message] }),
      );
    }

    if (url.pathname.startsWith('/api/entities/') && req.method === 'GET') {
      const entity = url.pathname.split('/')[3];
      if (!ALLOWED_ENTITIES.has(entity)) {
        return json(res, 404, { ok: false, errors: ['ישות לא מוכרת'] });
      }
      if (!session.user.org_id) {
        return json(res, 403, { ok: false, errors: ['למשתמש זה אין עסק משויך.'] });
      }
      const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500);
      const rows = selectByEntity.all(entity, session.user.org_id, limit);
      return json(res, 200, {
        ok: true,
        items: rows.map((r) => ({ id: r.entity_id, ...JSON.parse(r.payload) })),
      });
    }

    return json(res, 404, { ok: false, errors: ['נתיב API לא נמצא'] });
  }

  if (req.method !== 'GET') {
    res.writeHead(405).end('Method Not Allowed');
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`יומן הדברה – יצחק הדברות · השרת פועל על http://localhost:${PORT}`);
  console.log(`מסד נתונים: ${DB_PATH}`);
});
