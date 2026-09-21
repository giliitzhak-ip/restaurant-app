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
import { validatePayload, isDeletionAllowed } from './validate.js';

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

const ALLOWED_ENTITIES = new Set([
  'customers', 'customer_sites', 'journals', 'journal_pests', 'journal_actions',
  'journal_materials', 'materials', 'material_labels', 'treatment_templates',
  'customer_templates', 'routes', 'route_stops', 'tasks', 'bait_stations',
  'signatures', 'audit_log',
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
  INSERT INTO sync_documents (entity, entity_id, payload, received_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(entity, entity_id) DO UPDATE SET payload = excluded.payload, received_at = excluded.received_at
`);
const selectDoc = db.prepare('SELECT payload FROM sync_documents WHERE entity = ? AND entity_id = ?');
const selectByEntity = db.prepare('SELECT entity_id, payload FROM sync_documents WHERE entity = ? ORDER BY received_at DESC LIMIT ?');
const insertAudit = db.prepare(`
  INSERT INTO audit_log (id, entity, entity_id, action, field, before, after, user_id, user_name, at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

/** POST /api/sync – מקבל ישות בודדת מהתור של הלקוח. */
async function handleSync(req, res) {
  const body = await readBody(req);
  const { entity, entityId, payload } = body;

  if (!ALLOWED_ENTITIES.has(entity)) {
    return json(res, 400, { ok: false, errors: [`ישות לא מוכרת: ${entity}`] });
  }
  if (!entityId || typeof entityId !== 'string') {
    return json(res, 400, { ok: false, errors: ['entityId חסר או לא חוקי'] });
  }

  const errors = validatePayload(entity, payload);
  if (errors.length > 0) {
    return json(res, 422, { ok: false, errors });
  }

  const existingRow = selectDoc.get(entity, entityId);
  const existing = existingRow ? JSON.parse(existingRow.payload) : null;

  if (!isDeletionAllowed(entity, existing) && payload.status === 'cancelled' && !payload.cancelledReason) {
    return json(res, 422, { ok: false, errors: ['ביטול יומן שהושלם מחייב סיבה מתועדת.'] });
  }

  const now = new Date().toISOString();
  upsertDoc.run(entity, entityId, JSON.stringify(payload), now);

  insertAudit.run(
    crypto.randomUUID(),
    entity,
    entityId,
    existing ? 'update' : 'create',
    null,
    existing ? JSON.stringify(existing).slice(0, 2000) : null,
    JSON.stringify(payload).slice(0, 2000),
    payload.userId ?? null,
    payload.userName ?? null,
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

    if (url.pathname === '/api/sync' && req.method === 'POST') {
      return handleSync(req, res).catch((err) =>
        json(res, 400, { ok: false, errors: [err.message] }),
      );
    }

    if (url.pathname.startsWith('/api/entities/') && req.method === 'GET') {
      const entity = url.pathname.split('/')[3];
      if (!ALLOWED_ENTITIES.has(entity)) {
        return json(res, 404, { ok: false, errors: ['ישות לא מוכרת'] });
      }
      const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500);
      const rows = selectByEntity.all(entity, limit);
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
