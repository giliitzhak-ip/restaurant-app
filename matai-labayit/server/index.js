/**
 * שרת עיבוד (Proxy) אופציונלי ל"מתאים לבית".
 * תפקידו: להחזיק את מפתחות ה-API של שירותי ה-AI בצד השרת (ולא באפליקציה),
 * ולהעביר אליהם בקשות רק כשהמשתמש ביקש במפורש.
 *
 * ללא תלויות חיצוניות. Node.js 18+ (משתמש ב-fetch/FormData המובנים).
 *
 * משתני סביבה:
 *   PORT                  – פורט (ברירת מחדל 8787)
 *   REMOVE_BG_API_KEY     – מפתח ל-remove.bg (הסרת רקע)
 *   SEGMENT_SERVICE_URL   – כתובת שירות סגמנטציה משלכם (זיהוי קיר/רצפה), ראו README
 *   SEGMENT_SERVICE_TOKEN – טוקן (Bearer) לשירות הסגמנטציה, אם נדרש
 *   MOCK=1                – מצב הדגמה ללא ספקים: מחזיר תוצאות דמה לבדיקת החיבור
 *   ALLOWED_ORIGIN        – מקור מורשה ל-CORS (ברירת מחדל *)
 *
 * התמונות מעובדות בזיכרון בלבד ולא נשמרות בשרת.
 */
'use strict';
const http = require('node:http');
const zlib = require('node:zlib');

const PORT = Number(process.env.PORT || 8787);
const MAX_BODY = 15 * 1024 * 1024;
const MOCK = process.env.MOCK === '1';
const REMOVE_BG_API_KEY = process.env.REMOVE_BG_API_KEY || '';
const SEGMENT_SERVICE_URL = process.env.SEGMENT_SERVICE_URL || '';
const SEGMENT_SERVICE_TOKEN = process.env.SEGMENT_SERVICE_TOKEN || '';
const ORIGIN = process.env.ALLOWED_ORIGIN || '*';

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('התמונה גדולה מדי'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('גוף הבקשה אינו JSON תקין'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

// ---------- ספקים ----------
async function removeBackground(b64) {
  if (REMOVE_BG_API_KEY) {
    const form = new FormData();
    form.append('image_file_b64', b64);
    form.append('size', 'auto');
    form.append('format', 'png');
    const r = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': REMOVE_BG_API_KEY },
      body: form,
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw Object.assign(new Error(`remove.bg החזיר שגיאה ${r.status}: ${text.slice(0, 200)}`), { status: 502 });
    }
    return Buffer.from(await r.arrayBuffer()).toString('base64');
  }
  if (MOCK) return b64; // מצב דמה: מחזיר את התמונה כמו שהיא
  throw Object.assign(new Error('הסרת רקע בענן לא הוגדרה: חסר REMOVE_BG_API_KEY בשרת.'), { status: 501 });
}

async function segmentSurface(body) {
  if (SEGMENT_SERVICE_URL) {
    const r = await fetch(SEGMENT_SERVICE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(SEGMENT_SERVICE_TOKEN ? { Authorization: `Bearer ${SEGMENT_SERVICE_TOKEN}` } : {}) },
      body: JSON.stringify({ image: body.image, point: body.point, target: body.target }),
    });
    if (!r.ok) throw Object.assign(new Error(`שירות הסגמנטציה החזיר שגיאה ${r.status}`), { status: 502 });
    const j = await r.json();
    if (!j.mask) throw Object.assign(new Error('שירות הסגמנטציה לא החזיר mask'), { status: 502 });
    return j.mask;
  }
  if (MOCK) {
    const { width, height } = jpegSize(Buffer.from(body.image, 'base64')) || { width: 400, height: 300 };
    return mockMask(width, height, body.target);
  }
  throw Object.assign(new Error('זיהוי משטחים בענן לא הוגדר: חסר SEGMENT_SERVICE_URL בשרת.'), { status: 501 });
}

// ---------- עזרי דמה: קריאת מידות JPEG ויצירת PNG אפור ----------
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngRGBA(w, h, pixelFn) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const a = pixelFn(x, y);
      const o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = raw[o + 1] = raw[o + 2] = 255;
      raw[o + 3] = a;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function mockMask(W, H, target) {
  const w = 256;
  const h = Math.max(1, Math.round((256 * H) / W));
  const top = target === 'floor' ? 0.65 : target === 'ceiling' ? 0 : 0.05;
  const bottom = target === 'floor' ? 1 : target === 'ceiling' ? 0.18 : 0.65;
  return pngRGBA(w, h, (x, y) => (y / h >= top && y / h <= bottom ? 255 : 0)).toString('base64');
}

// ---------- שרת ----------
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  try {
    if (req.method === 'GET' && req.url === '/v1/health') {
      return send(res, 200, {
        ok: true,
        capabilities: {
          removeBackground: !!REMOVE_BG_API_KEY || MOCK,
          segmentSurface: !!SEGMENT_SERVICE_URL || MOCK,
          mock: MOCK && !REMOVE_BG_API_KEY && !SEGMENT_SERVICE_URL,
        },
      });
    }
    if (req.method === 'POST' && req.url === '/v1/remove-background') {
      const body = await readJson(req);
      if (!body.image) return send(res, 400, { error: 'חסרה תמונה' });
      return send(res, 200, { image: await removeBackground(body.image) });
    }
    if (req.method === 'POST' && req.url === '/v1/segment-surface') {
      const body = await readJson(req);
      if (!body.image) return send(res, 400, { error: 'חסרה תמונה' });
      return send(res, 200, { mask: await segmentSurface(body) });
    }
    send(res, 404, { error: 'לא נמצא' });
  } catch (e) {
    console.error(`[${new Date().toISOString()}] ${req.url}: ${e.message}`);
    send(res, e.status || 500, { error: e.message || 'שגיאת שרת' });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`matai-labayit server on :${PORT}`);
    console.log(`  remove background: ${REMOVE_BG_API_KEY ? 'remove.bg' : MOCK ? 'MOCK' : 'not configured'}`);
    console.log(`  segment surface:   ${SEGMENT_SERVICE_URL ? SEGMENT_SERVICE_URL : MOCK ? 'MOCK' : 'not configured'}`);
  });
}

module.exports = { server, jpegSize, mockMask };
