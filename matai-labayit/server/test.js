// בדיקות לשרת: node test.js
// אם המודלים מותקנים – נבדקות גם הסרת רקע, בחירה בנגיעה ועומק על תמונות ההדגמה.
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
process.env.MOCK = process.env.MOCK ?? '1';
const { server } = require('./index.js');
const vision = require('./vision.js');

const demo = (f) => fs.readFileSync(path.join(__dirname, '..', 'assets', 'demo', f)).toString('base64');
const post = (base, p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

server.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const h = await (await fetch(base + '/v1/health')).json();
    assert.equal(h.ok, true);
    console.log('health', JSON.stringify(h.capabilities));
    assert.equal((await post(base, '/v1/remove-background', {})).status, 400);
    const av = vision.available();
    if (av.isnet || av.sam) {
      const t = Date.now();
      const r = await (await post(base, '/v1/remove-background', { image: demo('sofa-store.jpg'), box: { x: 0.1, y: 0.06, w: 0.85, h: 0.88 } })).json();
      const sharp = require('sharp');
      const { data, info } = await sharp(Buffer.from(r.image, 'base64')).raw().toBuffer({ resolveWithObject: true });
      let opaque = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 128) opaque++;
      const frac = opaque / (info.width * info.height);
      console.log(`remove-background ${r.method} ${Date.now() - t}ms coverage ${frac.toFixed(3)}`);
      // הספה תופסת כ-22% מהתמונה; מדפים וארון בצד לא אמורים להיכלל
      assert.ok(frac > 0.15 && frac < 0.3, 'coverage in range');
    }
    if (av.sam) {
      const s = await (await post(base, '/v1/segment', { image: demo('room.jpg'), points: [{ x: 0.5, y: 0.2, label: 1 }] })).json();
      assert.ok(s.mask && s.score > 0.8, 'segment ok');
      console.log('segment score', s.score.toFixed(3));
    }
    if (av.midas) {
      const d = await (await post(base, '/v1/depth', { image: demo('room.jpg') })).json();
      assert.ok(d.depth && d.width > 0);
      console.log('depth', d.width, d.height);
    }
    const hz = await post(base, '/v1/harmonize', { image: demo('room.jpg') });
    assert.equal(hz.status, 501);
    console.log('server tests passed');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
