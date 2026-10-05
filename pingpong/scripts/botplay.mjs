// Plays the real game in a browser using only the mouse, like a human tracking the ball.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? 'screenshots';
const quality = process.env.Q ?? 'low';
const seconds = Number(process.env.SECS ?? 60);
const base = process.env.URL ?? 'http://localhost:8080';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 960), height: Number(process.env.H ?? 540) } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.addInitScript((q) => localStorage.setItem('pingpong3d.settings.v1', JSON.stringify({ lang: 'en', quality: q, showFps: true, tutorialDone: true, name: 'Bot' })), quality);
await page.goto(base);
await page.getByText('Play vs Computer').click();
await page.getByText('Easy').click();
await page.getByText('Start').click();
await page.waitForFunction(() => !!window.__pingpong);
let hits = 0, prevZ = null, prevVz = 0, shots = 0, fpsSamples = [];
const t0 = Date.now();
let lastScore = '';
while (Date.now() - t0 < seconds * 1000) {
  const st = await page.evaluate(() => {
    const p = window.__pingpong; const v = p.view(); const s = p.score(); const z = p.paddleZ();
    const b = v.ball;
    const aim = p.screenOf(b.x, Math.max(0.8, Math.min(1.5, b.y)), z);
    return { b, s, aim, fps: p.fps(), rs: p.renderSize() };
  });
  const { b, s } = st;
  if (prevZ !== null) {
    const vz = b.z - prevZ;
    if (prevVz > 0.002 && vz < -0.002 && b.z > 1.2) hits++;
    prevVz = vz;
  }
  prevZ = b.z;
  await page.mouse.move(st.aim.x, st.aim.y);
  if (s.phase === 'serve' && s.server === 0) { await page.mouse.click(st.aim.x, st.aim.y); shots++; }
  const sc = `${s.points[0]}-${s.points[1]} ${s.phase}`;
  if (sc !== lastScore && s.phase === 'point') console.log('score', sc, JSON.stringify(s.lastPoint));
  lastScore = sc;
  fpsSamples.push(st.fps);
}
await page.screenshot({ path: `${out}/bot-${quality}.png` });
const s = await page.evaluate(() => window.__pingpong.score());
const rs = await page.evaluate(() => window.__pingpong.renderSize());
console.log({ quality, hitsByBot: hits, serves: shots, score: s.points, phase: s.phase, avgFps: (fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length).toFixed(1), renderSize: rs, errors });
await browser.close();
