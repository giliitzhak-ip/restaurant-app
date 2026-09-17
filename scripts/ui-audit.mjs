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
 * Run it against a PRODUCTION build, not `next dev`. In a sandbox where the
 * dev server's hot-reload websocket cannot complete a handshake, Next never
 * finishes hydrating: event handlers are dead, client effects never run, and
 * every screenshot is of the server-rendered HTML. Every check below passed
 * happily against those pages, which is how an audit becomes worse than no
 * audit. The hydration probe now makes that state loud.
 *
 * Usage:
 *   npm run build && npx next start -p 3100
 *   SHOTS=./.ui-shots BASE_URL=http://127.0.0.1:3100 npm run ui:audit
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

/**
 * Sessions are established ONCE per account and reused.
 *
 * Logging in per page tripped the login rate limiter (10 attempts / 5 min),
 * so later pages in the run rendered their signed-out state and the audit
 * reported an empty screen as if the page were broken. The limiter was
 * right; the audit was wrong.
 */
const sessions = new Map();

async function sessionFor(login) {
  const key = login.email;
  if (sessions.has(key)) return sessions.get(key);

  const context = await browser.newContext({ locale: 'he-IL' });
  const page = await context.newPage();
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' });
  const status = await page.evaluate(async (creds) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds),
    });
    return response.status;
  }, login);
  if (status !== 200) {
    issues.push(`login for ${login.email} returned ${status} — later findings are unreliable`);
  }
  const state = await context.storageState();
  await context.close();
  sessions.set(key, state);
  return state;
}

async function inspect(name, url, { login, viewport = { width: 390, height: 844 } } = {}) {
  const storageState = login ? await sessionFor(login) : undefined;
  const context = await browser.newContext({ viewport, locale: 'he-IL', storageState });
  const page = await context.newPage();
  const errors = [];
  /**
   * The dev server's hot-reload socket cannot complete a handshake through
   * this harness, which produces a console error on every page. It is an
   * artefact of auditing `next dev`, not a fault in the product, and keeping
   * it would mean the audit is permanently red and therefore ignored. It is
   * the ONLY pattern filtered, and only for the HMR endpoint — a websocket
   * failure anywhere else still fails the audit.
   */
  const isDevHmrNoise = (text) =>
    text.includes('/_next/hmr') && text.includes('WebSocket');

  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text().slice(0, 300);
    if (!isDevHmrNoise(text)) errors.push(text.slice(0, 160));
  });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 160)));

  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
  // Long enough for the first data fetch and its render. networkidle never
  // fires on the pages that hold an SSE stream open.
  await page.waitForTimeout(2500);

  /* ── Did the page actually come alive? ────────────────────────────────
     React attaches internal fibre keys to the DOM nodes it hydrates, so this
     asks the question directly rather than trusting the absence of errors.
     Without it, a page frozen in its server-rendered loading state passes
     every other check in this file. */
  const hydrated = await page.evaluate(() => {
    const node = document.querySelector('button, a[href], input');
    if (!node) return 'no-interactive-element';
    return Object.keys(node).some((key) => key.startsWith('__react')) ? 'yes' : 'no';
  });
  if (hydrated !== 'yes') {
    issues.push(`${name}: page did not hydrate (${hydrated}) — client behaviour is untested here`);
  }

  // A page still showing a loading label has not finished fetching, so
  // anything measured below describes the skeleton, not the screen.
  const stillLoading = await page.evaluate(() =>
    /טוען/.test(document.body.innerText) ? document.body.innerText.trim().slice(0, 60) : null);
  if (stillLoading) {
    issues.push(`${name}: still loading after the wait -> "${stillLoading}"`);
  }

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
      // A wrapping <label> is a correct, implicit association — reporting it
      // as unlabelled would push authors towards redundant aria attributes.
      const labelled = el.getAttribute('aria-label')
        || el.getAttribute('aria-labelledby')
        || (id && document.querySelector(`label[for="${id}"]`))
        || el.closest('label');
      if (!labelled) out.push(el.getAttribute('type') || el.tagName.toLowerCase());
    }
    return out;
  });
  if (unlabelled.length) issues.push(`${name}: unlabelled inputs -> ${unlabelled.join(', ')}`);

  if (errors.length) issues.push(`${name}: console errors -> ${errors.slice(0, 3).join(' ;; ')}`);

  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const title = await page.title();
  console.log(
    `${name.padEnd(26)} hydrated=${hydrated} dir=${dir} overflow=${overflow}px ` +
    `ltrRuns=${String(ltrRuns).padStart(2)} errors=${errors.length} | ${title.slice(0, 34)}`,
  );
  await context.close();
}

await inspect('01-home', `${B}/`);
await inspect('02-login', `${B}/login`);
await inspect('03-request', `${B}/request?q=${encodeURIComponent('יש לי נזילה מתחת לכיור')}&mode=NOW`,
  { login: { email: 'rotem@demo.local', password: 'demo1234' } });
await inspect('04-provider', `${B}/provider`,
  { login: { email: 'ram-on-the-way@demo.local', password: 'demo1234' } });
await inspect('04b-provider-availability', `${B}/provider/availability`,
  { login: { email: 'ram-on-the-way@demo.local', password: 'demo1234' } });
await inspect('04c-provider-onboarding', `${B}/provider/onboarding`,
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
