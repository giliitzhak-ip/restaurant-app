/**
 * מודלי ראייה ממוחשבת שרצים על השרת שלכם (CPU), בלי שירות צד שלישי ובלי מפתחות API:
 *  - Segment Anything (SAM ViT-B, מקוונטז) – בחירת אובייקט/משטח לפי נקודות או מלבן.
 *  - ISNet (DIS, general-use) – הסרת רקע עם שוליים רכים ומדויקים.
 *  - MiDaS small – מפת עומק יחסית (להסתרה אוטומטית ולרמזי מישורים).
 * רישיונות: SAM – Apache-2.0, ISNet/rembg – Apache-2.0/MIT, MiDaS – MIT.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MODELS_DIR = process.env.MODELS_DIR || path.join(__dirname, 'models');
const FILES = {
  samEncoder: 'vit_b-encoder-quant.onnx',
  samDecoder: 'vit_b-decoder-quant.onnx',
  isnet: 'isnet-general-use.onnx',
  midas: 'midas-small.onnx',
};

let ort = null;
let sharp = null;
try {
  ort = require('onnxruntime-node');
  sharp = require('sharp');
} catch {
  // התלויות לא הותקנו – השרת יעבוד רק במצב ספקים חיצוניים/דמה
}

const has = (k) => !!ort && !!sharp && fs.existsSync(path.join(MODELS_DIR, FILES[k]));
const vision_available = () => ({
  sam: has('samEncoder') && has('samDecoder'),
  isnet: has('isnet'),
  midas: has('midas'),
});

const sessions = {};
async function session(k) {
  if (!sessions[k]) sessions[k] = ort.InferenceSession.create(path.join(MODELS_DIR, FILES[k]), { graphOptimizationLevel: 'all' });
  return sessions[k];
}

// ---------- קריאה וכתיבה של תמונות ----------
/** מפענח base64 לתמונת RGB גולמית, כולל תיקון כיוון EXIF והקטנה לגודל סביר. */
async function decode(b64, maxDim = 2048) {
  const buf = Buffer.from(b64, 'base64');
  const img = sharp(buf, { failOn: 'none' }).rotate().resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true }).removeAlpha().toColourspace('srgb');
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, hash: crypto.createHash('sha1').update(buf).digest('hex') };
}

/** מסכה (0..255, גודל w×h) → PNG לבן עם ערוץ אלפא. */
async function maskPng(mask, w, h) {
  const rgba = Buffer.alloc(w * h * 4, 255);
  for (let i = 0; i < w * h; i++) rgba[i * 4 + 3] = mask[i];
  return (await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 8 }).toBuffer()).toString('base64');
}

/** תמונת המוצר עם אלפא = מסכה. */
async function cutoutPng(img, mask) {
  const { data, width: w, height: h } = img;
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = data[i * 3];
    rgba[i * 4 + 1] = data[i * 3 + 1];
    rgba[i * 4 + 2] = data[i * 3 + 2];
    rgba[i * 4 + 3] = mask[i];
  }
  return (await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 8 }).toBuffer()).toString('base64');
}

async function resizeRaw(data, w, h, channels, W, H, fit = 'fill') {
  let p = sharp(data, { raw: { width: w, height: h, channels } }).resize(W, H, { fit, kernel: 'lanczos3' });
  // sharp ממיר ערוץ יחיד ל-3 ערוצים כברירת מחדל – שומרים על ערוץ אחד
  if (channels === 1) p = p.toColourspace('b-w');
  return p.raw().toBuffer();
}

// ---------- SAM ----------
const SAM_MEAN = [123.675, 116.28, 103.53];
const SAM_STD = [58.395, 57.12, 57.375];
const embCache = new Map(); // hash -> {emb, scale}

async function samEmbed(img) {
  const hit = embCache.get(img.hash);
  if (hit) return hit;
  const scale = 1024 / Math.max(img.width, img.height);
  const nw = Math.round(img.width * scale);
  const nh = Math.round(img.height * scale);
  const small = await resizeRaw(img.data, img.width, img.height, 3, nw, nh);
  const x = new Float32Array(3 * 1024 * 1024); // ריפוד באפסים (אחרי נרמול) מימין ולמטה
  for (let y = 0; y < nh; y++)
    for (let xx = 0; xx < nw; xx++) {
      const si = (y * nw + xx) * 3;
      for (let c = 0; c < 3; c++) x[c * 1024 * 1024 + y * 1024 + xx] = (small[si + c] - SAM_MEAN[c]) / SAM_STD[c];
    }
  const enc = await session('samEncoder');
  const out = await enc.run({ x: new ort.Tensor('float32', x, [1, 3, 1024, 1024]) });
  const res = { emb: out.image_embeddings, scale };
  embCache.set(img.hash, res);
  if (embCache.size > 4) embCache.delete(embCache.keys().next().value);
  return res;
}

/**
 * @param points [{x,y,label}] בפיקסלים של התמונה; label 1=כלול, 0=לא כלול
 * @param box {x,y,w,h} בפיקסלים (לא חובה)
 * @returns מסכה 0/255 בגודל התמונה + ציון איכות
 */
async function samSegment(img, points = [], box) {
  const { emb, scale } = await samEmbed(img);
  const coords = [];
  const labels = [];
  for (const p of points) {
    coords.push(p.x * scale, p.y * scale);
    labels.push(p.label ? 1 : 0);
  }
  if (box) {
    coords.push(box.x * scale, box.y * scale, (box.x + box.w) * scale, (box.y + box.h) * scale);
    labels.push(2, 3);
  } else {
    coords.push(0, 0);
    labels.push(-1); // נקודת ריפוד כשאין מלבן (כמו במימוש המקורי)
  }
  const n = labels.length;
  const dec = await session('samDecoder');
  const out = await dec.run({
    image_embeddings: emb,
    point_coords: new ort.Tensor('float32', Float32Array.from(coords), [1, n, 2]),
    point_labels: new ort.Tensor('float32', Float32Array.from(labels), [1, n]),
    mask_input: new ort.Tensor('float32', new Float32Array(256 * 256), [1, 1, 256, 256]),
    has_mask_input: new ort.Tensor('float32', new Float32Array([0]), [1]),
    orig_im_size: new ort.Tensor('float32', new Float32Array([img.height, img.width]), [2]),
  });
  // הערה: ה-upscale המובנה של המפענח (masks) מוזז במודל המכומת הזה – לכן מגדילים בעצמנו
  // את low_res_masks (256² במרחב 1024 המרופד): חיתוך לאזור התמונה והגדלה בילינארית לגודל המקורי.
  const lr = out.low_res_masks;
  const [, K, lh, lw] = lr.dims;
  const ious = out.iou_predictions.data;
  let best = 0;
  for (let k = 1; k < K; k++) if (ious[k] > ious[best]) best = k;
  const W = img.width;
  const H = img.height;
  const f = lw / 1024; // תאי low-res לפיקסל במרחב 1024
  const off = best * lw * lh;
  const at = (x, y) => lr.data[off + Math.min(lh - 1, Math.max(0, y)) * lw + Math.min(lw - 1, Math.max(0, x))];
  const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const ly = (y + 0.5) * scale * f - 0.5;
    const y0 = Math.floor(ly);
    const fy = ly - y0;
    for (let x = 0; x < W; x++) {
      const lx = (x + 0.5) * scale * f - 0.5;
      const x0 = Math.floor(lx);
      const fx = lx - x0;
      const v = (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
      m[y * W + x] = v > 0 ? 255 : 0;
    }
  }
  fillSmallHoles(m, W, H, 0.02);
  return { mask: m, width: W, height: H, score: ious[best] };
}

// ---------- ISNet ----------
async function isnetAlpha(img) {
  const S = 1024;
  const small = await resizeRaw(img.data, img.width, img.height, 3, S, S);
  const x = new Float32Array(3 * S * S);
  for (let i = 0; i < S * S; i++) for (let c = 0; c < 3; c++) x[c * S * S + i] = small[i * 3 + c] / 255 - 0.5;
  const s = await session('isnet');
  const out = await s.run({ input_image: new ort.Tensor('float32', x, [1, 3, S, S]) });
  const pred = out[s.outputNames[0]].data;
  let mi = Infinity;
  let ma = -Infinity;
  for (let i = 0; i < S * S; i++) {
    if (pred[i] < mi) mi = pred[i];
    if (pred[i] > ma) ma = pred[i];
  }
  const a = Buffer.alloc(S * S);
  for (let i = 0; i < S * S; i++) a[i] = Math.round(((pred[i] - mi) / (ma - mi || 1)) * 255);
  return new Uint8Array(await resizeRaw(a, S, S, 1, img.width, img.height));
}

function dilateBlur(m, w, h, r) {
  // הרחבה + טשטוש קופסה – "מעטפת" רכה סביב מסכת SAM
  const out = new Float32Array(w * h);
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = -r; k <= r && !v; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < w && m[y * w + xx]) v = 255;
      }
      tmp[y * w + x] = v;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = -r; k <= r && !v; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < h && tmp[yy * w + x]) v = 255;
      }
      out[y * w + x] = v;
    }
  return out;
}

/** מילוי חורים סגורים קטנים במסכה (ארטיפקטים של SAM באזורים אחידים). */
function fillSmallHoles(mask, w, h, maxFrac = 0.15) {
  const seen = new Uint8Array(w * h);
  let area = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) area++;
  const stack = new Int32Array(w * h);
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] || seen[i]) continue;
    let sp = 0;
    stack[sp++] = i;
    seen[i] = 1;
    const comp = [];
    let touchesEdge = false;
    while (sp) {
      const p = stack[--sp];
      comp.push(p);
      const x = p % w;
      const y = (p - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesEdge = true;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of nb) if (q >= 0 && !mask[q] && !seen[q]) {
        seen[q] = 1;
        stack[sp++] = q;
      }
    }
    if (!touchesEdge && comp.length < area * maxFrac) for (const p of comp) mask[p] = 255;
  }
  return mask;
}

/** רכיבים קשירים של מסכה בינארית. */
function components(bin, w, h) {
  const label = new Int32Array(w * h).fill(-1);
  const sizes = [];
  const stack = new Int32Array(w * h);
  for (let i = 0; i < bin.length; i++) {
    if (!bin[i] || label[i] >= 0) continue;
    const id = sizes.length;
    let sp = 0;
    stack[sp++] = i;
    label[i] = id;
    let n = 0;
    while (sp) {
      const p = stack[--sp];
      n++;
      const x = p % w;
      const y = (p - x) / w;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of nb) if (q >= 0 && bin[q] && label[q] < 0) {
        label[q] = id;
        stack[sp++] = q;
      }
    }
    sizes.push(n);
  }
  return { label, sizes };
}

/** ISNet על חלון (עם שוליים) סביב המלבן – ממוקד יותר מאשר על כל התמונה. */
async function isnetInBox(img, box) {
  const pad = 0.08;
  const x0 = Math.max(0, Math.floor(box.x - box.w * pad));
  const y0 = Math.max(0, Math.floor(box.y - box.h * pad));
  const x1 = Math.min(img.width, Math.ceil(box.x + box.w * (1 + pad)));
  const y1 = Math.min(img.height, Math.ceil(box.y + box.h * (1 + pad)));
  const cw = x1 - x0;
  const ch = y1 - y0;
  const crop = Buffer.alloc(cw * ch * 3);
  for (let y = 0; y < ch; y++) img.data.copy(crop, y * cw * 3, ((y0 + y) * img.width + x0) * 3, ((y0 + y) * img.width + x1) * 3);
  const a = await isnetAlpha({ data: crop, width: cw, height: ch });
  const full = new Uint8Array(img.width * img.height);
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const gx = x0 + x;
      const gy = y0 + y;
      if (gx >= box.x && gx <= box.x + box.w && gy >= box.y && gy <= box.y + box.h) full[gy * img.width + gx] = a[y * cw + x];
    }
  return full;
}

/**
 * הסרת רקע:
 *  - ISNet מפיק את החיתוך עם שוליים רכים (על חלון סביב המלבן שסימן המשתמש).
 *  - SAM (במלבן) מזהה *איזה* אובייקט הוא המוצר: משאירים רק רכיבים של ISNet שחופפים לו,
 *    כך שמוצרים/מדפים אחרים בתוך המלבן לא נכנסים.
 *  - אם ISNet לא מצא דבר – נופלים ל-SAM עם מילוי חורים.
 */
async function removeBackground(img, box) {
  const av = vision_available();
  const W = img.width;
  const H = img.height;
  if (!av.isnet && !av.sam) throw Object.assign(new Error('אין מודל להסרת רקע בשרת. הריצו npm run models.'), { status: 501 });
  const alpha = av.isnet ? (box ? await isnetInBox(img, box) : await isnetAlpha(img)) : null;
  const sam = box && av.sam ? await samSegment(img, [{ x: box.x + box.w / 2, y: box.y + box.h / 2, label: 1 }], box) : null;
  if (sam) fillSmallHoles(sam.mask, W, H);
  if (!alpha) return { mask: sam.mask, method: 'sam' };
  let fg = 0;
  for (let i = 0; i < alpha.length; i++) if (alpha[i] > 127) fg++;
  if (fg < W * H * 0.002) {
    if (sam) return { mask: sam.mask, method: 'sam' };
    return { mask: alpha, method: 'isnet' };
  }
  if (!sam) return { mask: alpha, method: 'isnet' };
  // בחירת רכיבים לפי חפיפה עם SAM
  const bin = new Uint8Array(W * H);
  for (let i = 0; i < bin.length; i++) bin[i] = alpha[i] > 100 ? 1 : 0;
  const { label, sizes } = components(bin, W, H);
  const overlap = new Float64Array(sizes.length);
  for (let i = 0; i < bin.length; i++) if (label[i] >= 0 && sam.mask[i]) overlap[label[i]]++;
  const keep = sizes.map((n, k) => overlap[k] / n > 0.35);
  if (!keep.some(Boolean)) return { mask: sam.mask, method: 'sam' };
  // שוליים רכים: פיקסלים עם אלפא נמוך נשמרים אם הם צמודים לרכיב שנבחר
  // חלקים קטנים וצמודים לגוף (רגליים, ידיות) ש-ISNet הפריד ברווח דק – שייכים למוצר
  const main = new Uint8Array(W * H);
  for (let i = 0; i < bin.length; i++) main[i] = label[i] >= 0 && keep[label[i]] ? 255 : 0;
  const reach = dilateBlur(main, W, H, Math.max(3, Math.round(Math.max(W, H) * 0.012)));
  const maxKept = Math.max(...sizes.filter((_, k) => keep[k]));
  const touches = new Uint8Array(sizes.length);
  for (let i = 0; i < bin.length; i++) if (label[i] >= 0 && !keep[label[i]] && reach[i]) touches[label[i]] = 1;
  sizes.forEach((n, k) => {
    if (touches[k] && n < maxKept * 0.05) keep[k] = true;
  });
  const kept = new Uint8Array(W * H);
  for (let i = 0; i < bin.length; i++) kept[i] = label[i] >= 0 && keep[label[i]] ? 255 : 0;
  const near = dilateBlur(kept, W, H, 3);
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < mask.length; i++) mask[i] = kept[i] ? Math.max(alpha[i], 200) : near[i] ? alpha[i] : 0;
  return { mask, method: 'isnet+sam' };
}

// ---------- MiDaS ----------
async function depth(img) {
  const S = 256;
  const small = await resizeRaw(img.data, img.width, img.height, 3, S, S);
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  const x = new Float32Array(3 * S * S);
  for (let i = 0; i < S * S; i++) for (let c = 0; c < 3; c++) x[c * S * S + i] = (small[i * 3 + c] / 255 - mean[c]) / std[c];
  const s = await session('midas');
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', x, [1, 3, S, S]) });
  const d = out[s.outputNames[0]].data;
  let mi = Infinity;
  let ma = -Infinity;
  for (const v of d) {
    if (v < mi) mi = v;
    if (v > ma) ma = v;
  }
  const g = Buffer.alloc(S * S);
  for (let i = 0; i < S * S; i++) g[i] = Math.round(((d[i] - mi) / (ma - mi || 1)) * 255); // בהיר = קרוב
  const w = Math.min(512, img.width);
  const h = Math.round((w * img.height) / img.width);
  const resized = await resizeRaw(g, S, S, 1, w, h);
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = resized[i];
    rgba[i * 4 + 3] = 255;
  }
  return { png: (await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()).toString('base64'), width: w, height: h };
}

/** מלבן חוסם של מסכה (עם שוליים יחסיים), או null. */
function maskBox(m, w, h, pad = 0) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (m[y * w + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const px = (x1 - x0) * pad;
  const py = (y1 - y0) * pad;
  const bx = Math.max(0, x0 - px);
  const by = Math.max(0, y0 - py);
  return { x: bx, y: by, w: Math.min(w, x1 + px) - bx, h: Math.min(h, y1 + py) - by };
}

module.exports = { maskBox, available: vision_available, decode, maskPng, cutoutPng, samSegment, removeBackground, depth, MODELS_DIR, FILES };
