// בדיקת עשן לשרת במצב דמה: node test.js
'use strict';
process.env.MOCK = '1';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { server } = require('./index.js');

server.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const h = await (await fetch(base + '/v1/health')).json();
    assert.equal(h.ok, true);
    const image = fs.readFileSync(path.join(__dirname, '..', 'assets', 'demo', 'room.jpg')).toString('base64');
    const rb = await fetch(base + '/v1/remove-background', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image }) });
    assert.equal(rb.status, 200);
    const seg = await (await fetch(base + '/v1/segment-surface', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image, point: { x: 0.5, y: 0.3 }, target: 'wall' }) })).json();
    assert.ok(Buffer.from(seg.mask, 'base64').subarray(1, 4).toString() === 'PNG', 'mask is PNG');
    const bad = await fetch(base + '/v1/remove-background', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(bad.status, 400);
    console.log('server tests passed');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
