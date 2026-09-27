// הורדת מודלי ה-AI לשרת (פעם אחת, ~350MB). מקורות: שחרורי GitHub של rembg (SAM, ISNet) ו-MiDaS.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { MODELS_DIR, FILES } = require('../vision');

const SOURCES = {
  [FILES.samEncoder]: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/vit_b-encoder-quant.onnx',
  [FILES.samDecoder]: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/vit_b-decoder-quant.onnx',
  [FILES.isnet]: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx',
  [FILES.midas]: 'https://github.com/isl-org/MiDaS/releases/download/v2_1/model-small.onnx',
};

(async () => {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  for (const [name, url] of Object.entries(SOURCES)) {
    const dest = path.join(MODELS_DIR, name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1e6) {
      console.log(`✓ ${name} (קיים)`);
      continue;
    }
    process.stdout.write(`↓ ${name} … `);
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest + '.part'));
    fs.renameSync(dest + '.part', dest);
    console.log(`${(fs.statSync(dest).size / 1e6).toFixed(0)}MB`);
  }
  console.log('המודלים מוכנים ב-' + MODELS_DIR);
})().catch((e) => {
  console.error('ההורדה נכשלה:', e.message);
  process.exit(1);
});
