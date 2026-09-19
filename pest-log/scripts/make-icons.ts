/**
 * מייצר את אייקוני ה-PWA מקובץ ה-SVG, בעזרת Chromium.
 * שימוש: npx tsx scripts/make-icons.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.join(import.meta.dirname, '..');
const svg = readFileSync(path.join(root, 'public', 'favicon.svg'), 'utf8');

const targets: Array<{ file: string; size: number; maskable: boolean }> = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
];

const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH?.trim();
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: ['--no-sandbox'],
});

for (const target of targets) {
  const page = await browser.newPage({ viewport: { width: target.size, height: target.size } });
  // באייקון maskable נדרש שולי ביטחון של כ-10% מכל צד.
  const padding = target.maskable ? Math.round(target.size * 0.12) : 0;
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#0b0b0d">
    <div style="width:${target.size}px;height:${target.size}px;display:grid;place-items:center;background:#0b0b0d">
      <div style="width:${target.size - padding * 2}px;height:${target.size - padding * 2}px">${svg}</div>
    </div></body></html>`);
  const buffer = await page.screenshot({ omitBackground: false });
  writeFileSync(path.join(root, 'public', 'icons', target.file), buffer);
  await page.close();
  console.info(`✓ ${target.file}`);
}

await browser.close();
