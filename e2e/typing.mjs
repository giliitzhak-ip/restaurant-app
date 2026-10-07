/**
 * הקלדה רציפה בשדות. באג שהיה: ה-effect של הדיאלוג היה תלוי ב-onClose,
 * שנוצר מחדש בכל רינדור, ולכן כל הקשה החזירה את הפוקוס לאלמנט הראשון
 * ורק התו הראשון נשמר בשדה.
 */

import { chromium, devices } from 'playwright';
import { authenticate, createFreshBusiness } from './helpers.mjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const LAUNCH = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};

/* עסק חדש ומאושר לכל הרצה: האפליקציה מסנכרנת נתונים מהשרת,
   ובלי עסק נפרד הבדיקה הייתה רואה נתונים של הרצות קודמות. */
const BIZ = await createFreshBusiness(BASE);
const results = [];
const check = (n, p, d = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'} · ${n}${d ? ' · ' + d : ''}`); };

const browser = await chromium.launch(LAUNCH);
const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'he-IL' });
await authenticate(ctx, BASE, BIZ);
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

/** מקליד תו-תו, כפי שמשתמש מקליד בפועל. */
async function typeSlowly(locator, text) {
  await locator.click();
  await locator.pressSequentially(text, { delay: 60 });
}

/* ───── דיאלוג לקוח חדש במסך לקוחות ───── */
await page.goto(`${BASE}/#/customers`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: '+ לקוח חדש' }).click();
await page.waitForTimeout(400);

await typeSlowly(page.getByLabel('שם לקוח / עסק'), 'מסעדת הגפן');
check('שם לקוח נקלט במלואו',
  (await page.getByLabel('שם לקוח / עסק').inputValue()) === 'מסעדת הגפן',
  await page.getByLabel('שם לקוח / עסק').inputValue());

await typeSlowly(page.getByLabel('איש קשר'), 'יניב כהן');
check('איש קשר נקלט במלואו',
  (await page.getByLabel('איש קשר').inputValue()) === 'יניב כהן',
  await page.getByLabel('איש קשר').inputValue());

await typeSlowly(page.getByLabel('טלפון'), '0501234567');
check('טלפון נקלט במלואו',
  (await page.getByLabel('טלפון').inputValue()) === '0501234567',
  await page.getByLabel('טלפון').inputValue());

await typeSlowly(page.getByLabel('דוא״ל'), 'yaniv@example.com');
check('דוא״ל נקלט במלואו',
  (await page.getByLabel('דוא״ל').inputValue()) === 'yaniv@example.com',
  await page.getByLabel('דוא״ל').inputValue());

await typeSlowly(page.getByLabel('כתובת', { exact: true }), 'הרצל 10, תל אביב');
check('כתובת נקלטת במלואה',
  (await page.getByLabel('כתובת', { exact: true }).inputValue()) === 'הרצל 10, תל אביב',
  await page.getByLabel('כתובת', { exact: true }).inputValue());

await typeSlowly(page.getByLabel('הערות קבועות'), 'קוד שער 1234');
check('הערות נקלטות במלואן',
  (await page.getByLabel('הערות קבועות').inputValue()) === 'קוד שער 1234',
  await page.getByLabel('הערות קבועות').inputValue());

// הפוקוס נשאר בשדה שבו מקלידים
const focused = await page.evaluate(() => document.activeElement?.id ?? '');
check('הפוקוס נשאר בשדה האחרון שהוקלד', focused.includes('notes') || focused.includes('cc-notes'), focused);

await page.getByRole('button', { name: 'שמור', exact: true }).click();
await page.waitForTimeout(700);
check('הלקוח נשמר עם הפרטים המלאים', await page.getByText('מסעדת הגפן').first().isVisible());

/* ───── אותו דיאלוג בתוך אשף היומן ───── */
await page.locator('.nav-fab').click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: /המשך לשלב 2/ }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: '+ לקוח חדש' }).click();
await page.waitForTimeout(400);
await typeSlowly(page.getByLabel('שם לקוח / עסק'), 'בניין רימון');
check('דיאלוג הלקוח באשף קולט הקלדה רציפה',
  (await page.getByLabel('שם לקוח / עסק').inputValue()) === 'בניין רימון',
  await page.getByLabel('שם לקוח / עסק').inputValue());
await page.getByRole('button', { name: 'ביטול' }).click();
await page.waitForTimeout(300);

/* ───── שדות מחוץ לדיאלוג ───── */
await page.getByRole('button', { name: /המשך לשלב 3/ }).click();
await page.waitForTimeout(300);
await typeSlowly(page.getByLabel('הערות מקצועיות'), 'נמצאה פעילות במטבח');
check('שדה רגיל באשף קולט הקלדה רציפה',
  (await page.getByLabel('הערות מקצועיות').inputValue()) === 'נמצאה פעילות במטבח',
  await page.getByLabel('הערות מקצועיות').inputValue());

/* ───── דיאלוג עובד חדש ───── */
await page.goto(`${BASE}/#/team`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.getByRole('button', { name: '+ הוספת עובד' }).click();
await page.waitForTimeout(400);
await typeSlowly(page.getByLabel('שם העובד'), 'דנה לוי');
check('דיאלוג עובד חדש קולט הקלדה רציפה',
  (await page.getByLabel('שם העובד').inputValue()) === 'דנה לוי',
  await page.getByLabel('שם העובד').inputValue());

/* ───── Escape עדיין סוגר ───── */
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check('Escape סוגר את הדיאלוג', (await page.locator('.dialog').count()) === 0);

check('אין שגיאות דף', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n=== ${results.length - failed}/${results.length} עברו ===`);
process.exit(failed ? 1 : 0);
