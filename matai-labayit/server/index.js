/**
 * שרת העיבוד של "מתאים לבית" (לא חובה – האפליקציה עובדת גם בלעדיו).
 *
 * 1. מודלי AI מקומיים על השרת (ללא מפתחות API, ראו vision.js):
 *    SAM – בחירת אובייקט/משטח בנגיעה או במלבן, ISNet – הסרת רקע, MiDaS – עומק.
 *    התקנה: npm install && npm run models
 * 2. ספקים חיצוניים אופציונליים – המפתחות נשמרים רק כאן, אף פעם לא באפליקציה.
 *
 * משתני סביבה:
 *   PORT                  – פורט (ברירת מחדל 8787)
 *   REMOVE_BG_API_KEY     – מפתח ל-remove.bg (חלופה להסרת רקע)
 *   SEGMENT_SERVICE_URL   – שירות סגמנטציה חיצוני (אם לא משתמשים ב-SAM המקומי)
 *   SEGMENT_SERVICE_TOKEN – טוקן (Bearer) לשירות הסגמנטציה, אם נדרש
 *   HARMONIZE_SERVICE_URL – שירות יצירת תמונה להשתלבות (ראו /v1/harmonize); לא מחובר כברירת מחדל
 *   HARMONIZE_SERVICE_TOKEN
 *   MOCK=1                – מצב דמה כשאין מודלים: מחזיר תוצאות דמה לבדיקת החיבור
 *   ALLOWED_ORIGIN        – מקור מורשה ל-CORS (ברירת מחדל *)
 *
 * התמונות מעובדות בזיכרון בלבד ולא נשמרות בשרת.
 */
'use strict';
const http = require('node:http');
const zlib = require('node:zlib');

const vision = require('./vision');

const PORT = Number(process.env.PORT || 8787);
const MAX_BODY = 25 * 1024 * 1024;
const HARMONIZE_SERVICE_URL = process.env.HARMONIZE_SERVICE_URL || '';
const HARMONIZE_SERVICE_TOKEN = process.env.HARMONIZE_SERVICE_TOKEN || '';
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
/** נקודות/מלבן מגיעים מנורמלים (0..1) – ממירים לפיקסלים של התמונה המפוענחת. */
const px = (img, r) => r && { x: r.x * img.width, y: r.y * img.height, w: (r.w ?? 0) * img.width, h: (r.h ?? 0) * img.height };

async function removeBackground(b64, box, provider) {
  const av = vision.available();
  if ((av.sam || av.isnet) && provider !== 'removebg') {
    const img = await vision.decode(b64, 2048);
    const { mask, method } = await vision.removeBackground(img, px(img, box));
    return { image: await vision.cutoutPng(img, mask), method, width: img.width, height: img.height };
  }
  return { image: await removeBackgroundProvider(b64), method: REMOVE_BG_API_KEY ? 'remove.bg' : 'mock' };
}

async function removeBackgroundProvider(b64) {
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

/** בחירה בנגיעה/מלבן (SAM). points: [{x,y,label}] מנורמלים. */
async function segment(body) {
  const av = vision.available();
  if (av.sam) {
    const img = await vision.decode(body.image, 1600);
    const points = (body.points || (body.point ? [{ ...body.point, label: 1 }] : [])).map((p) => ({ x: p.x * img.width, y: p.y * img.height, label: p.label ?? 1 }));
    let r = await vision.samSegment(img, points, px(img, body.box));
    // נגיעה בלבד: סבב שני עם מלבן סביב התוצאה הראשונה – מסכה שלמה יותר של אותו חפץ
    if (!body.box && points.length) {
      const b = vision.maskBox(r.mask, r.width, r.height, 0.1);
      if (b) {
        const r2 = await vision.samSegment(img, points, b);
        const hit = points.every((p) => !p.label || r2.mask[Math.round(p.y) * r2.width + Math.round(p.x)]);
        const area = (m) => m.reduce((a, v) => a + (v ? 1 : 0), 0);
        // השלמה של אותו חפץ – לא מעבר לאובייקט אחר (למשל רצפה → רצפה+קירות)
        const grow = area(r2.mask) / Math.max(1, area(r.mask));
        if (hit && grow < 1.6 && r2.score >= r.score - 0.05) r = r2;
      }
    }
    return { mask: await vision.maskPng(r.mask, r.width, r.height), score: r.score, width: r.width, height: r.height, method: 'sam' };
  }
  return { mask: await segmentSurface(body), method: SEGMENT_SERVICE_URL ? 'external' : 'mock' };
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

/**
 * השתלבות בעזרת מודל יצירת תמונה (לא מחובר כברירת מחדל).
 * החוזה: {image: ההדמיה המורכבת, mask: PNG שבו לבן = אזור שמותר לשנות (צל/שוליים/סביבה בלבד),
 * protect: PNG של המוצר – אסור לשנות, strength 0..1}. השרת מאכף את ההגנה: אחרי קבלת התוצאה
 * מחזירים את פיקסלי המוצר המקוריים, כך שהמודל לא יכול להחליף את דגם המוצר.
 */
async function harmonize(body) {
  if (!HARMONIZE_SERVICE_URL) return [501, { error: 'שירות השתלבות מבוסס יצירת תמונה לא הוגדר בשרת (HARMONIZE_SERVICE_URL).' }];
  if (!body.protect) return [400, { error: 'חובה לשלוח protect (מסכת המוצר) – כדי שהמוצר לא ישתנה' }];
  const r = await fetch(HARMONIZE_SERVICE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(HARMONIZE_SERVICE_TOKEN ? { Authorization: `Bearer ${HARMONIZE_SERVICE_TOKEN}` } : {}) },
    body: JSON.stringify({ image: body.image, mask: body.mask, strength: Math.min(0.6, body.strength ?? 0.3) }),
  });
  if (!r.ok) return [502, { error: `שירות ההשתלבות החזיר שגיאה ${r.status}` }];
  const j = await r.json();
  if (!j.image) return [502, { error: 'שירות ההשתלבות לא החזיר תמונה' }];
  // אכיפת שמירת המוצר: מדביקים חזרה את פיקסלי המוצר המקוריים לפי protect
  const sharp = require('sharp');
  const base = sharp(Buffer.from(body.image, 'base64'));
  const meta = await base.metadata();
  const gen = await sharp(Buffer.from(j.image, 'base64')).resize(meta.width, meta.height).ensureAlpha().raw().toBuffer();
  const orig = await base.ensureAlpha().raw().toBuffer();
  const prot = await sharp(Buffer.from(body.protect, 'base64')).resize(meta.width, meta.height).ensureAlpha().extractChannel(3).raw().toBuffer();
  for (let i = 0; i < prot.length; i++) {
    const a = prot[i] / 255;
    for (let c = 0; c < 3; c++) gen[i * 4 + c] = Math.round(orig[i * 4 + c] * a + gen[i * 4 + c] * (1 - a));
  }
  const out = await sharp(gen, { raw: { width: meta.width, height: meta.height, channels: 4 } }).jpeg({ quality: 90 }).toBuffer();
  return [200, { image: out.toString('base64'), generated: true }];
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
      const av = vision.available();
      const real = av.sam || av.isnet || !!REMOVE_BG_API_KEY || !!SEGMENT_SERVICE_URL;
      return send(res, 200, {
        ok: true,
        capabilities: {
          removeBackground: av.sam || av.isnet || !!REMOVE_BG_API_KEY || MOCK,
          segmentSurface: av.sam || !!SEGMENT_SERVICE_URL || MOCK,
          segment: av.sam,
          depth: av.midas,
          harmonize: !!HARMONIZE_SERVICE_URL,
          models: av,
          mock: MOCK && !real,
        },
      });
    }
    const body = req.method === 'POST' ? await readJson(req) : {};
    if (req.method === 'POST' && !body.image) return send(res, 400, { error: 'חסרה תמונה' });
    if (req.method === 'POST' && req.url === '/v1/remove-background') {
      return send(res, 200, await removeBackground(body.image, body.box, body.provider));
    }
    if (req.method === 'POST' && (req.url === '/v1/segment' || req.url === '/v1/segment-surface')) {
      return send(res, 200, await segment(body));
    }
    if (req.method === 'POST' && req.url === '/v1/depth') {
      if (!vision.available().midas) return send(res, 501, { error: 'מודל העומק לא מותקן בשרת (npm run models).' });
      const img = await vision.decode(body.image, 1024);
      const d = await vision.depth(img);
      return send(res, 200, { depth: d.png, width: d.width, height: d.height });
    }
    if (req.method === 'POST' && req.url === '/v1/harmonize') {
      return send(res, ...(await harmonize(body)));
    }
    send(res, 404, { error: 'לא נמצא' });
  } catch (e) {
    console.error(`[${new Date().toISOString()}] ${req.url}: ${e.message}`);
    send(res, e.status || 500, { error: e.message || 'שגיאת שרת' });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    const av = vision.available();
    console.log(`matai-labayit server on :${PORT}`);
    console.log(`  local models: SAM=${av.sam} ISNet=${av.isnet} MiDaS=${av.midas} (${vision.MODELS_DIR})`);
    console.log(`  remove.bg: ${REMOVE_BG_API_KEY ? 'configured' : 'no'} · segment service: ${SEGMENT_SERVICE_URL || 'no'} · harmonize: ${HARMONIZE_SERVICE_URL || 'no'} · mock: ${MOCK}`);
  });
}

module.exports = { server, jpegSize, mockMask };
