/**
 * בדיקת קבלה: עבודה ללא רשת.
 *
 * כאן לא נבדק "נראה שיש service worker", אלא מה שקורה בפועל כשהרשת
 * מנותקת: האם האפליקציה נטענת מחדש, האם הנתונים נשארים, האם אפשר
 * להמשיך לתעד, והאם מה שתועד מגיע לשרת כשהחיבור חוזר.
 */

import { chromium, devices } from 'playwright';
import { authenticate, createFreshBusiness } from './helpers.mjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const LAUNCH = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};
const BIZ = await createFreshBusiness(BASE);

const results = [];
const check = (name, pass, detail = '') => {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'} · ${name}${detail ? ' · ' + detail : ''}`);
};

const appErrors = [];
const browser = await chromium.launch(LAUNCH);
const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'he-IL' });
const auth = await authenticate(ctx, BASE, BIZ);
const page = await ctx.newPage();
page.on('pageerror', (e) => appErrors.push('pageerror: ' + e.message));

const ONLINE_CUSTOMER = `לקוח מקוון ${Date.now()}`;
const OFFLINE_CUSTOMER = `לקוח ללא רשת ${Date.now()}`;

const addCustomer = async (name, address) => {
  await page.getByRole('button', { name: '+ לקוח חדש' }).click();
  await page.getByLabel('שם לקוח / עסק').fill(name);
  await page.getByLabel('כתובת', { exact: true }).fill(address);
  await page.getByRole('button', { name: 'שמור', exact: true }).click();
  await page.waitForTimeout(900);
};

const serverCustomers = async () => {
  const res = await fetch(`${BASE}/api/entities/customers?limit=500`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  return (await res.json()).items ?? [];
};

/* ───── טעינה מקוונת, ורישום service worker ───── */
await page.goto(BASE + '/#/customers', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const swReady = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return false;
  const reg = await navigator.serviceWorker.ready;
  return Boolean(reg.active);
});
check('service worker נרשם והופעל', swReady);

await addCustomer(ONLINE_CUSTOMER, 'הרצל 1, תל אביב');
check('לקוח נשמר במצב מקוון', await page.getByText(ONLINE_CUSTOMER).first().isVisible());
await page.waitForTimeout(800);
check('הלקוח המקוון הגיע לשרת',
  (await serverCustomers()).some((c) => c.name === ONLINE_CUSTOMER));

/* ───── מנתקים את הרשת ───── */
await ctx.setOffline(true);
await page.waitForTimeout(400);

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
check('האפליקציה נטענת מחדש ללא רשת',
  await page.getByRole('button', { name: '+ לקוח חדש' }).isVisible());
check('הנתונים שנשמרו עדיין מוצגים ללא רשת',
  await page.getByText(ONLINE_CUSTOMER).first().isVisible());

const pill = page.locator('.save-pill').first();
check('החיווי מצהיר שאין חיבור',
  ((await pill.textContent()) ?? '').includes('לא מחובר'),
  ((await pill.textContent()) ?? '').trim());

/* ───── ממשיכים לתעד ללא רשת ───── */
await addCustomer(OFFLINE_CUSTOMER, 'האלון 5, חיפה');
check('אפשר לתעד לקוח חדש ללא רשת',
  await page.getByText(OFFLINE_CUSTOMER).first().isVisible());

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
check('מה שתועד ללא רשת שורד רענון ללא רשת',
  await page.getByText(OFFLINE_CUSTOMER).first().isVisible());

const pendingText = (await page.locator('.save-pill').first().textContent()) ?? '';
check('החיווי אינו מתחזה לסנכרון מוצלח',
  !pendingText.includes('סונכרן'), pendingText.trim());

check('הלקוח שתועד ללא רשת עדיין אינו בשרת',
  !(await serverCustomers()).some((c) => c.name === OFFLINE_CUSTOMER));

/* ───── הרשת חוזרת ───── */
await ctx.setOffline(false);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
check('מה שתועד ללא רשת מגיע לשרת כשהחיבור חוזר',
  (await serverCustomers()).some((c) => c.name === OFFLINE_CUSTOMER));

const afterText = (await page.locator('.save-pill').first().textContent()) ?? '';
check('החיווי מצהיר שהסנכרון הושלם',
  afterText.includes('סונכרן'), afterText.trim());

check('אין שגיאות דף', appErrors.length === 0, appErrors.join(' | '));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n=== ${passed}/${results.length} עברו ===`);
process.exit(passed === results.length ? 0 : 1);
