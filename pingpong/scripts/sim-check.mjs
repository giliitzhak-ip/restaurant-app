// Drives the Simulator mode in a browser: start AI vs AI, change speed and cameras, read stats.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? 'screenshots';
const base = process.env.URL ?? 'http://localhost:8080';
const lang = process.env.LANG_UI ?? 'he';
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript((l) => localStorage.setItem('pingpong3d.settings.v1', JSON.stringify({ lang: l, quality: 'medium', tutorialDone: true })), lang);
await page.goto(base);
const T = lang === 'he' ? { sim: 'סימולטור', start: 'התחל', cams: ['שידור', 'צד', 'מלמעלה', 'שחקן'] } : { sim: 'Simulator', start: 'Start', cams: ['Broadcast', 'Side', 'Top', 'Player'] };
await page.getByRole('button', { name: T.sim }).click();
await page.screenshot({ path: `${out}/sim-setup.png` });
await page.getByRole('button', { name: T.start }).click();
await page.waitForSelector('.sim-panel');
await page.getByRole('radio', { name: '4x' }).click();
await page.waitForTimeout(12000);
for (const [i, c] of T.cams.entries()) {
  await page.getByRole('radio', { name: c, exact: true }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/sim-cam-${i}.png` });
}
const stats = await page.textContent('.sim-panel');
const score = await page.evaluate(() => window.__pingpong.score());
console.log('score', score.points, score.phase, '\npanel:', stats.replace(/\s+/g, ' '));
console.log('errors', errors);
await browser.close();
