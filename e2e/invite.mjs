/**
 * בדיקת קבלה: הזמנת עובד ואיפוס סיסמה בלי סיסמה בטקסט גלוי.
 *
 * עד התיקון בעל העסק הקליד סיסמה ראשונית לעובד ומסר אותה לו,
 * כך שסיסמת העובד הייתה ידועה לאדם נוסף ונשארה בהיסטוריית ההודעות.
 */

import { chromium, devices } from 'playwright';
import { authenticate, createFreshBusiness } from './helpers.mjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const LAUNCH = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};
const BIZ = await createFreshBusiness(BASE, 'עסק הזמנות');

const results = [];
const check = (name, pass, detail = '') => {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'} · ${name}${detail ? ' · ' + detail : ''}`);
};

const appErrors = [];
const browser = await chromium.launch(LAUNCH);
const phone = { ...devices['iPhone 12'], locale: 'he-IL' };

const ownerCtx = await browser.newContext(phone);
await authenticate(ownerCtx, BASE, BIZ);
const owner = await ownerCtx.newPage();
owner.on('pageerror', (e) => appErrors.push('pageerror(owner): ' + e.message));

const WORKER_NAME = 'דנה לוי';
const WORKER_EMAIL = `worker${Date.now()}@dev.local`;
const WORKER_PASSWORD = 'DanaField123';

/* ───── בעל העסק מזמין עובד ───── */
await owner.goto(BASE + '/#/team', { waitUntil: 'networkidle' });
await owner.waitForTimeout(900);
await owner.getByRole('button', { name: '+ הזמנת עובד' }).click();
await owner.waitForTimeout(400);
check('דיאלוג ההזמנה אינו מבקש סיסמה',
  (await owner.getByLabel(/סיסמה/).count()) === 0);

await owner.getByLabel('שם העובד').fill(WORKER_NAME);
await owner.getByLabel('דוא״ל').fill(WORKER_EMAIL);
await owner.getByRole('button', { name: 'צור קישור הזמנה' }).click();
await owner.waitForTimeout(1500);

const inviteUrl = (await owner.locator('.invite-link').first().textContent() ?? '').trim();
check('נוצר קישור הזמנה', inviteUrl.includes('#/invite/'), inviteUrl.slice(0, 60));
check('מוצג שהקישור חד-פעמי ובעל תוקף',
  (await owner.locator('.page').textContent()).includes('קובע את הסיסמה בעצמו'));
check('העובד מופיע ברשימה', await owner.getByText(WORKER_NAME).first().isVisible());

/* ───── העובד קובע סיסמה בעצמו ───── */
const workerCtx = await browser.newContext(phone);
const worker = await workerCtx.newPage();
worker.on('pageerror', (e) => appErrors.push('pageerror(worker): ' + e.message));
await worker.goto(inviteUrl, { waitUntil: 'networkidle' });
await worker.waitForTimeout(1500);
check('מסך קביעת הסיסמה מציג את שם העובד',
  (await worker.locator('.auth-card').textContent()).includes(WORKER_NAME));
check('מסך קביעת הסיסמה מציג את שם העסק',
  (await worker.locator('.auth-card').textContent()).includes(BIZ.orgName));

await worker.getByLabel('סיסמה חדשה').fill(WORKER_PASSWORD);
await worker.getByLabel('שוב, לאישור').fill('שונה לגמרי');
await worker.getByRole('button', { name: 'קביעת סיסמה וכניסה' }).click();
await worker.waitForTimeout(900);
check('אי-התאמה בין הסיסמאות נעצרת',
  (await worker.locator('.auth-card').textContent()).includes('אינן זהות'));

await worker.getByLabel('שוב, לאישור').fill(WORKER_PASSWORD);
await worker.getByRole('button', { name: 'קביעת סיסמה וכניסה' }).click();
await worker.waitForTimeout(2500);
check('העובד נכנס לאפליקציה מיד אחרי קביעת הסיסמה',
  await worker.locator('.bottom-nav').isVisible());
check('העובד משויך לעסק הנכון',
  (await worker.locator('.topbar').textContent()).includes(BIZ.orgName));

/* ───── הקישור אינו עובד פעמיים ───── */
const secondCtx = await browser.newContext(phone);
const second = await secondCtx.newPage();
await second.goto(inviteUrl, { waitUntil: 'networkidle' });
await second.waitForTimeout(1500);
check('קישור שנעשה בו שימוש אינו נפתח שוב',
  (await second.locator('.auth-card').textContent()).includes('אינו פעיל'));
await secondCtx.close();

/* ───── איפוס סיסמה ───── */
await owner.goto(BASE + '/#/team', { waitUntil: 'networkidle' });
await owner.waitForTimeout(1200);
await owner.getByRole('button', { name: 'איפוס סיסמה' }).first().click();
await owner.waitForTimeout(1500);
const resetUrl = (await owner.locator('.invite-link').first().textContent() ?? '').trim();
check('נוצר קישור לאיפוס סיסמה', resetUrl.includes('#/invite/'), resetUrl.slice(0, 60));

await worker.reload({ waitUntil: 'networkidle' });
await worker.waitForTimeout(2000);
check('האיפוס מנתק את העובד מהמערכת',
  await worker.getByRole('button', { name: 'כניסה' }).isVisible());

await worker.goto(resetUrl, { waitUntil: 'networkidle' });
await worker.waitForTimeout(1500);
await worker.getByLabel('סיסמה חדשה').fill('DanaNew12345');
await worker.getByLabel('שוב, לאישור').fill('DanaNew12345');
await worker.getByRole('button', { name: 'קביעת סיסמה וכניסה' }).click();
await worker.waitForTimeout(2500);
check('העובד נכנס עם הסיסמה החדשה', await worker.locator('.bottom-nav').isVisible());

check('אין שגיאות דף', appErrors.length === 0, appErrors.join(' | '));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n=== ${passed}/${results.length} עברו ===`);
process.exit(passed === results.length ? 0 : 1);
