// Visual smoke test: open the game in headless Chromium, take screenshots.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? 'screenshots';
const base = process.env.URL ?? 'http://localhost:8080';
const exe = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(base);
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/01-menu-he.png` });
await page.getByText('משחק מול מחשב').click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/02-vsai-setup.png` });
await page.getByText('התחל').click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/03-first-time.png` });
await page.getByText('דלג ושחק').click();
await page.waitForTimeout(2500);
await page.mouse.move(640, 560);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/04-countdown.png` });
// Serve and rally a bit, moving the mouse toward the ball's x.
await page.mouse.click(640, 560);
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(100);
  if (i === 6) await page.screenshot({ path: `${out}/05-rally.png` });
}
await page.screenshot({ path: `${out}/06-later.png` });
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
