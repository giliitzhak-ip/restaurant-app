/**
 * מערכת הזמנות למסעדה
 * Node.js v22+ — ללא תלויות חיצוניות
 * הרצה: node server.js
 */

'use strict';
const { DatabaseSync } = require('node:sqlite');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = 3000;
const PUBLIC = path.join(__dirname, 'public');

// ─── Database setup ───────────────────────────────────────────────────────────
const db = new DatabaseSync('restaurant.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    price REAL NOT NULL,
    category TEXT NOT NULL,
    available INTEGER DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_number INTEGER NOT NULL,
    status TEXT DEFAULT 'new',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    menu_item_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    special_request TEXT DEFAULT '',
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
  );
`);

// Seed menu once
const { count } = db.prepare('SELECT COUNT(*) as count FROM menu_items').get();
if (count === 0) {
  const ins = db.prepare('INSERT INTO menu_items (name,description,price,category) VALUES (?,?,?,?)');
  [
    ['קולה','שתייה קלה',12,'שתייה'],
    ['מים מינרלים','בקבוק 500 מ"ל',10,'שתייה'],
    ['ביירה','ביירה קרה מהברז',28,'שתייה'],
    ['יין אדום','כוס יין הבית',35,'שתייה'],
    ['לחם ושמן','לחם טרי עם שמן זית',22,'מנות ראשונות'],
    ['סלט בית','עגבניות, מלפפון, בצל',38,'מנות ראשונות'],
    ['חומוס','חומוס ביתי עם שמן זית',32,'מנות ראשונות'],
    ['פסטה ארבע גבינות','ספגטי עם רוטב גבינות',72,'מנות עיקריות'],
    ['סטייק אנטריקוט','300 גרם, לפי בחירה',145,'מנות עיקריות'],
    ['דג סלמון','פילה סלמון על האש עם ירקות',98,'מנות עיקריות'],
    ['עוף על האש','חזה עוף עם תוספת לבחירה',78,'מנות עיקריות'],
    ['תפוחי אדמה צלויים','',22,'תוספות'],
    ['אורז','',18,'תוספות'],
    ['טירמיסו','קלאסי איטלקי',42,'קינוחים'],
    ['פנה קוטה','עם קוליס פירות יער',38,'קינוחים'],
  ].forEach(r => ins.run(...r));
  console.log('✅ תפריט לדוגמה נוצר');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

function json(res, data, status) {
  status = status || 200;
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(payload);
}

const MIME = { '.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ico':'image/x-icon','.svg':'image/svg+xml' };
function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'text/plain' });
    res.end(data);
  });
}

// ─── API ──────────────────────────────────────────────────────────────────────
function handleApi(req, res, method, urlPath) {
  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type' });
    return res.end();
  }

  // ── Menu (customer) ──
  if (method === 'GET' && urlPath === '/api/menu') {
    return json(res, db.prepare('SELECT * FROM menu_items WHERE available=1 ORDER BY category,name').all());
  }

  // ── Menu admin: all items ──
  if (method === 'GET' && urlPath === '/api/menu/all') {
    return json(res, db.prepare('SELECT * FROM menu_items ORDER BY category,name').all());
  }

  // ── Menu admin: add item ──
  if (method === 'POST' && urlPath === '/api/menu') {
    readBody(req).then(function(body) {
      var name = body.name, description = body.description, price = body.price, category = body.category;
      if (!name || !price || !category) return json(res, { error: 'missing fields' }, 400);
      var r = db.prepare('INSERT INTO menu_items (name,description,price,category) VALUES (?,?,?,?)').run(name, description || '', parseFloat(price), category);
      json(res, { success: true, id: r.lastInsertRowid }, 201);
    });
    return;
  }

  var menuIdMatch = urlPath.match(/^\/api\/menu\/(\d+)$/);

  // ── Menu admin: update item ──
  if (method === 'PUT' && menuIdMatch) {
    readBody(req).then(function(body) {
      var name = body.name, description = body.description, price = body.price, category = body.category;
      if (!name || !price || !category) return json(res, { error: 'missing fields' }, 400);
      db.prepare('UPDATE menu_items SET name=?,description=?,price=?,category=? WHERE id=?').run(name, description || '', parseFloat(price), category, menuIdMatch[1]);
      json(res, { success: true });
    });
    return;
  }

  // ── Menu admin: toggle available ──
  var menuAvailMatch = urlPath.match(/^\/api\/menu\/(\d+)\/available$/);
  if (method === 'PATCH' && menuAvailMatch) {
    readBody(req).then(function(body) {
      db.prepare('UPDATE menu_items SET available=? WHERE id=?').run(body.available ? 1 : 0, menuAvailMatch[1]);
      json(res, { success: true });
    });
    return;
  }

  // ── Menu admin: delete item ──
  if (method === 'DELETE' && menuIdMatch) {
    db.prepare('DELETE FROM menu_items WHERE id=?').run(menuIdMatch[1]);
    return json(res, { success: true });
  }

  // ── Stats ──
  if (method === 'GET' && urlPath === '/api/stats') {
    return json(res, {
      new:           db.prepare("SELECT COUNT(*) c FROM orders WHERE status='new'").get().c,
      preparing:     db.prepare("SELECT COUNT(*) c FROM orders WHERE status IN ('seen','preparing')").get().c,
      ready:         db.prepare("SELECT COUNT(*) c FROM orders WHERE status='ready'").get().c,
      active_tables: db.prepare("SELECT COUNT(DISTINCT table_number) c FROM orders WHERE status NOT IN ('served','cancelled')").get().c,
    });
  }

  // ── Orders history ──
  if (method === 'GET' && urlPath === '/api/orders/history') {
    return json(res, db.prepare("SELECT o.id,o.table_number,o.status,o.updated_at, GROUP_CONCAT(mi.name||' x'||oi.quantity,' | ') items_summary FROM orders o LEFT JOIN order_items oi ON o.id=oi.order_id LEFT JOIN menu_items mi ON oi.menu_item_id=mi.id WHERE o.status='served' GROUP BY o.id ORDER BY o.updated_at DESC LIMIT 50").all());
  }

  // ── Active orders ──
  if (method === 'GET' && urlPath === '/api/orders') {
    var orders = db.prepare("SELECT * FROM orders WHERE status NOT IN ('served','cancelled') ORDER BY created_at ASC").all();
    var getItems = db.prepare("SELECT oi.quantity,oi.special_request,mi.id,mi.name,mi.price,mi.category FROM order_items oi JOIN menu_items mi ON oi.menu_item_id=mi.id WHERE oi.order_id=?");
    return json(res, orders.map(function(o) { return Object.assign({}, o, { items: getItems.all(o.id) }); }));
  }

  // ── Create order ──
  if (method === 'POST' && urlPath === '/api/orders') {
    readBody(req).then(function(body) {
      var table_number = body.table_number, items = body.items, notes = body.notes;
      if (!table_number || !items || !items.length) return json(res, { error: 'missing fields' }, 400);
      var r = db.prepare('INSERT INTO orders (table_number,notes) VALUES (?,?)').run(table_number, notes || '');
      var orderId = r.lastInsertRowid;
      var insItem = db.prepare('INSERT INTO order_items (order_id,menu_item_id,quantity,special_request) VALUES (?,?,?,?)');
      items.forEach(function(it) { insItem.run(orderId, it.menu_item_id, it.quantity, it.special_request || ''); });
      json(res, { success: true, order_id: orderId }, 201);
    });
    return;
  }

  // ── Update order status ──
  var patchMatch = urlPath.match(/^\/api\/orders\/(\d+)\/status$/);
  if (method === 'PATCH' && patchMatch) {
    readBody(req).then(function(body) {
      var valid = ['new','seen','preparing','ready','served','cancelled'];
      if (valid.indexOf(body.status) === -1) return json(res, { error: 'invalid status' }, 400);
      db.prepare("UPDATE orders SET status=?,updated_at=datetime('now') WHERE id=?").run(body.status, patchMatch[1]);
      json(res, { success: true });
    });
    return;
  }

  json(res, { error: 'Not found' }, 404);
}

// ─── Server ───────────────────────────────────────────────────────────────────
http.createServer(function(req, res) {
  var urlPath = req.url.split('?')[0];
  var method = req.method.toUpperCase();
  if (urlPath.startsWith('/api/')) return handleApi(req, res, method, urlPath);

  var filePath = path.join(PUBLIC, urlPath === '/' ? 'restaurant.html' : urlPath);
  if (!filePath.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  serveFile(res, filePath);

}).listen(PORT, function() {
  console.log('\n🍽️  שרת המסעדה פועל!\n');
  console.log('   📺  ממשק מסעדה  →  http://localhost:' + PORT + '/restaurant.html');
  console.log('   📱  ממשק לקוח   →  http://localhost:' + PORT + '/customer.html?table=5');
  console.log('\n   (החלף ?table=5 במספר השולחן)\n');
});
