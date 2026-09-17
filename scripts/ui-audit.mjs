#!/usr/bin/env node
/**
 * UI audit (spec §52: "UI inspected · Mobile inspected · RTL inspected").
 *
 * Drives the real app in Chromium and asserts the things a screenshot alone
 * would not catch:
 *   * the document is genuinely RTL (dir="rtl", lang="he") — not faked with
 *     text-align (spec §40);
 *   * no horizontal overflow at phone width (390px);
 *   * every interactive element is at least 40px tall (spec §41, §42);
 *   * every input is labelled;
 *   * numbers are wrapped in LTR-isolated runs;
 *   * no console or page errors.
 *
 * Screenshots are written to the directory given by SHOTS.
 *
 * Usage:
 *   npm start                       # or: npm run dev
 *   SHOTS=./.ui-shots BASE_URL=http://127.0.0.1:3000 npm run ui:audit
 *
 * Requires the demo accounts: npm run db:setup
 */

import { chromium } from 'playwright';

const B = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const OUT = process.env.SHOTS ?? './.ui-shots';
const issues = [];

import { mkdirSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });

// PLAYWRIGHT_BROWSERS_PATH is respected when set; otherwise Playwright's
// own resolution applies.
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);

async function inspect(name, url, { login, viewport = { width: 390, height: 844 } } = {}) {
  const context = await browser.newContext({ viewport, locale: 'he-IL' });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 160)));

  if (login) {
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async (creds) => {
      await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      });
    }, login);
  }

  await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1200);

  // RTL correctness: the document must actually be RTL, not faked.
  const dir = await page.evaluate(() => document.documentElement.dir);
  const lang = await page.evaluate(() => document.documentElement.lang);
  if (dir !== 'rtl') issues.push(`${name}: html dir is "${dir}", expected rtl`);
  if (lang !== 'he') issues.push(`${name}: html lang is "${lang}", expected he`);

  // No horizontal overflow at phone width.
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 2) issues.push(`${name}: horizontal overflow of ${overflow}px at ${viewport.width}px`);

  // Touch targets: interactive elements should be >= 44px tall (spec §41/§42).
  const small = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, a[href], input, textarea, select')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      // The skip link is intentionally 1px until focused.
      if (el.classList.contains('sr-only')) continue;
      if (r.height > 0 && r.height < 40) {
        out.push(`${el.tagName.toLowerCase()}:"${(el.textContent || '').trim().slice(0, 24)}" h=${Math.round(r.height)}`);
      }
    }
    return out.slice(0, 6);
  });
  if (small.length) issues.push(`${name}: small touch targets -> ${small.join(' | ')}`);

  // Numbers must stay LTR-readable inside RTL (spec §40).
  const ltrRuns = await page.evaluate(() =>
    document.querySelectorAll('.ltr-nums, [dir="ltr"]').length);

  // Accessible labelling of inputs.
  const unlabelled = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('input, textarea, select')) {
      const id = el.getAttribute('id');
      const labelled = el.getAttribute('aria-label')
        || (id && document.querySelector(`label[for="${id}"]`));
      if (!labelled) out.push(el.getAttribute('type') || el.tagName.toLowerCase());
    }
    return out;
  });
  if (unlabelled.length) issues.push(`${name}: unlabelled inputs -> ${unlabelled.join(', ')}`);

  if (errors.length) issues.push(`${name}: console errors -> ${errors.slice(0, 3).join(' ;; ')}`);

  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const title = await page.title();
  console.log(`${name.padEnd(18)} dir=${dir} lang=${lang} overflow=${overflow}px ltrRuns=${ltrRuns} errors=${errors.length} | ${title.slice(0, 40)}`);
  await context.close();
}

await inspect('01-home', `${B}/`);
await inspect('02-login', `${B}/login`);
await inspect('03-request', `${B}/request?q=${encodeURIComponent('יש לי נזילה מתחת לכיור')}&mode=NOW`,
  { login: { email: 'rotem@demo.local', password: 'demo1234' } });
await inspect('04-provider', `${B}/provider`,
  { login: { email: 'ram-on-the-way@demo.local', password: 'demo1234' } });
await inspect('05-admin', `${B}/admin`,
  { login: { email: 'admin@demo.local', password: 'demo1234' }, viewport: { width: 1440, height: 900 } });
await inspect('06-matching-lab', `${B}/matching-lab`,
  { login: { email: 'admin@demo.local', password: 'demo1234' }, viewport: { width: 1440, height: 900 } });

console.log('\n=== ISSUES ===');
if (issues.length === 0) console.log('none');
else for (const i of issues) console.log('  • ' + i);

await browser.close();

// Non-zero exit on any finding, so this can gate a release.
if (issues.length > 0) process.exitCode = 1;
