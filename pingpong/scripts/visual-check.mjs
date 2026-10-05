// Visual checks in headless Chromium: 4K Ultra render size, mobile landscape touch
// controls, portrait rotate prompt, tutorial and settings screens.
// Usage: node scripts/visual-check.mjs [screenshotDir]   (server must be running)
import { chromium, devices } from 'playwright-core';

const out = process.argv[2] ?? 'screenshots';
const base = process.env.URL ?? 'http://localhost:8080';
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const settings = (o) => JSON.stringify({ lang: 'en', tutorialDone: true, name: 'Tester', ...o });
const errors = [];

// 1) Ultra on a 1080p-class window with devicePixelRatio 2 -> 3840x2160 drawing buffer.
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((s) => localStorage.setItem('pingpong3d.settings.v1', s), settings({ quality: 'ultra', dynamicRes: false, showFps: true }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page.getByText('Play vs Computer').click();
  await page.getByText('Start').click();
  await page.waitForFunction(() => !!window.__pingpong);
  await page.waitForTimeout(4000);
  const rs = await page.evaluate(() => window.__pingpong.renderSize());
  const canvas = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return { w: c.width, h: c.height };
  });
  console.log('ULTRA render size', rs, 'canvas buffer', canvas);
  await page.screenshot({ path: `${out}/ultra-4k.png`, scale: 'css' });
  await ctx.close();
}

// 2) Phone in landscape with touch: touch pad + buttons, tutorial running.
{
  const phone = devices['iPhone 13 landscape'] ?? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
  const ctx = await browser.newContext({ ...phone, userAgent: undefined });
  await ctx.addInitScript((s) => localStorage.setItem('pingpong3d.settings.v1', s), settings({ quality: 'low', tutorialDone: false }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page.getByText('Practice').first().tap();
  await page.getByText('Training court').tap();
  await page.waitForSelector('.touch-pad');
  const pad = await page.locator('.touch-pad').boundingBox();
  const ballBefore = await page.evaluate(() => window.__pingpong.view().pads[0].p);
  // Drag inside the touch pad to the right edge: the paddle should move right.
  const cdp = await ctx.newCDPSession(page);
  const touch = async (type, x, y) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await touch('touchStart', pad.x + pad.width * 0.5, pad.y + pad.height * 0.5);
  for (let i = 1; i <= 10; i++) await touch('touchMove', pad.x + pad.width * (0.5 + i * 0.045), pad.y + pad.height * 0.5);
  await page.waitForTimeout(1500);
  await touch('touchEnd', 0, 0);
  const padAfter = await page.evaluate(() => window.__pingpong.view().pads[0].p);
  console.log('touch pad drag moved paddle x from', ballBefore.x.toFixed(2), 'to', padAfter.x.toFixed(2));
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Serve' }).tap();
  await page.waitForTimeout(800);
  const sc = await page.evaluate(() => window.__pingpong.score());
  console.log('after tapping Serve, phase =', sc.phase);
  await page.screenshot({ path: `${out}/mobile-landscape.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const rotateVisible = await page.locator('.rotate-overlay').isVisible();
  console.log('portrait shows rotate prompt:', rotateVisible);
  await page.screenshot({ path: `${out}/mobile-portrait.png` });
  await ctx.close();
}

// 3) Settings and practice tutorial on desktop (English).
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript((s) => localStorage.setItem('pingpong3d.settings.v1', s), settings({ quality: 'medium' }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.screenshot({ path: `${out}/settings-en.png` });
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Practice' }).click();
  await page.getByRole('button', { name: 'Training court' }).click();
  await page.waitForTimeout(5000);
  await page.mouse.move(700, 560);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/tutorial-en.png` });
  await ctx.close();
}
console.log('page errors:', errors);
await browser.close();
