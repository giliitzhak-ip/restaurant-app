/**
 * זרימת הזהות בממשק: כניסה, רישום עסק, מסך המתנה לאישור,
 * קונסולת מנהל המערכת, ניהול עובדים והפרדת נתונים בין משתמשים.
 */

import { chromium, devices } from 'playwright';
import { ACCOUNTS, authenticate } from './helpers.mjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const LAUNCH = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};

const results = [];
const check = (n, p, d = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'} · ${n}${d ? ' · ' + d : ''}`); };
const phone = { ...devices['iPhone 12'], locale: 'he-IL' };

const browser = await chromium.launch(LAUNCH);
const errs = [];

/* ───── אורח רואה מסך כניסה ───── */
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  check('ללא התחברות מוצג מסך כניסה', await page.getByRole('button', { name: 'כניסה' }).isVisible());
  check('אין גישה לנתונים לפני התחברות', !(await page.locator('.bottom-nav').isVisible()));

  // כתובת חד-פעמית לכל הרצה: נעילת הניסיונות היא לפי כתובת,
  // ובכתובת קבועה הבדיקה הייתה נכשלת בהרצה החוזרת (429 במקום 401).
  await page.getByLabel('דוא״ל').fill(`nobody+${Date.now()}@dev.local`);
  await page.getByLabel('סיסמה').fill('WrongPass123');
  await page.getByRole('button', { name: 'כניסה' }).click();
  await page.waitForTimeout(800);
  check('סיסמה שגויה מציגה שגיאה', await page.getByText(/שגויים/).isVisible());

  await page.getByLabel('דוא״ל').fill(ACCOUNTS.owner.email);
  await page.getByLabel('סיסמה').fill(ACCOUNTS.owner.password);
  await page.getByRole('button', { name: 'כניסה' }).click();
  await page.waitForTimeout(1200);
  check('התחברות תקינה נכנסת לאפליקציה', await page.locator('.bottom-nav').isVisible());
  check('שם העסק מוצג בכותרת', (await page.locator('.topbar').textContent()).includes('יצחק הדברות'));
  await ctx.close();
}

/* ───── רישום עסק חדש ממתין לאישור ───── */
const newEmail = `biz${Date.now()}@dev.local`;
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'רישום עסק חדש' }).click();
  await page.waitForTimeout(400);
  await page.getByLabel('שם העסק').fill('הדברות בדיקה');
  await page.getByLabel('שם איש הקשר').fill('בודק');
  await page.getByLabel('דוא״ל').fill(newEmail);
  await page.getByLabel('סיסמה').fill('Tester12345');
  await page.getByRole('button', { name: 'שליחת בקשת רישום' }).click();
  await page.waitForTimeout(1200);
  check('רישום עסק מציג אישור קליטה', await page.getByText('ממתין לאישור').isVisible());

  await page.getByRole('button', { name: 'חזרה למסך הכניסה' }).click();
  await page.getByLabel('דוא״ל').fill(newEmail);
  await page.getByLabel('סיסמה').fill('Tester12345');
  await page.getByRole('button', { name: 'כניסה' }).click();
  await page.waitForTimeout(1200);
  check('עסק שטרם אושר נעצר במסך המתנה', await page.getByText('אין גישה למערכת').isVisible());
  check('מסך ההמתנה מסביר שהנתונים נשמרים',
    (await page.locator('.auth-card').textContent()).includes('אינם נמחקים'));
  check('עסק ממתין אינו רואה את האפליקציה', !(await page.locator('.bottom-nav').isVisible()));
  await ctx.close();
}

/* ───── מנהל המערכת מאשר ───── */
{
  const ctx = await browser.newContext(phone);
  await authenticate(ctx, BASE, ACCOUNTS.admin);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${BASE}/#/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check('מנהל המערכת מגיע לקונסולה', await page.getByRole('heading', { name: 'עסקים במערכת' }).isVisible());
  check('הבקשה החדשה מופיעה', await page.getByText('הדברות בדיקה').first().isVisible());
  check('הקונסולה מצהירה שאין גישה לנתוני הלקוחות',
    (await page.locator('.page').textContent()).includes('אינם נגישים ממסך זה'));

  const card = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'הדברות בדיקה' }) }).first();
  await card.getByRole('button', { name: /אשר · חודש ניסיון/ }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'מאושרים' }).click();
  await page.waitForTimeout(600);
  check('העסק עבר לסטטוס מאושר', await page.getByText('הדברות בדיקה').first().isVisible());
  await ctx.close();
}

/* ───── העסק שאושר נכנס ───── */
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByLabel('דוא״ל').fill(newEmail);
  await page.getByLabel('סיסמה').fill('Tester12345');
  await page.getByRole('button', { name: 'כניסה' }).click();
  await page.waitForTimeout(1200);
  check('אחרי אישור העסק נכנס לאפליקציה', await page.locator('.bottom-nav').isVisible());
  check('הכותרת מציגה את שם העסק שלו',
    (await page.locator('.topbar').textContent()).includes('הדברות בדיקה'));
  await ctx.close();
}

/* ───── הפרדת נתונים בין משתמשים על אותו מכשיר ───── */
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByLabel('דוא״ל').fill(ACCOUNTS.owner.email);
  await page.getByLabel('סיסמה').fill(ACCOUNTS.owner.password);
  await page.getByRole('button', { name: 'כניסה' }).click();
  await page.waitForTimeout(1200);

  await page.goto(`${BASE}/#/customers`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '+ לקוח חדש' }).click();
  await page.getByLabel('שם לקוח / עסק').fill('לקוח פרטי של יצחק');
  await page.getByLabel('כתובת', { exact: true }).fill('רחוב 1');
  await page.getByRole('button', { name: 'שמור', exact: true }).click();
  await page.waitForTimeout(900);
  check('הלקוח נשמר אצל הבעלים', await page.getByText('לקוח פרטי של יצחק').first().isVisible());

  const logout = async () => {
    await page.getByRole('button', { name: 'יציאה מהחשבון' }).click();
    await page.waitForTimeout(1200);
  };
  const loginAs = async (email, password) => {
    await page.getByLabel('דוא״ל').fill(email);
    await page.getByLabel('סיסמה').fill(password);
    await page.getByRole('button', { name: 'כניסה' }).click();
    await page.waitForTimeout(1500);
    await page.goto(`${BASE}/#/customers`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);   // טעינה מקומית ואחריה משיכה מהשרת
    return page.locator('.page').textContent();
  };

  await logout();
  check('יציאה מחזירה למסך הכניסה', await page.getByRole('button', { name: 'כניסה' }).isVisible());

  /* עסק אחר על אותו מכשיר: אינו רואה את הנתונים, לא מהאחסון המקומי
     של קודמו ולא מהשרת. זו ההפרדה שחייבת להחזיק. */
  const otherBusinessSees = await loginAs(newEmail, 'Tester12345');
  check('עסק אחר על אותו מכשיר אינו רואה את נתוני העסק הקודם',
    !otherBusinessSees.includes('לקוח פרטי של יצחק'));

  /* עובד של אותו עסק כן רואה – הנתון מגיע מהשרת, לא מהמכשיר של הבעלים.
     כך הרשאה שנשללת מפסיקה את הגישה, ועובד חדש אינו צריך העברת מכשיר. */
  await logout();
  const workerSees = await loginAs(ACCOUNTS.worker.email, ACCOUNTS.worker.password);
  check('עובד של אותו עסק רואה את נתוני העסק מהשרת',
    workerSees.includes('לקוח פרטי של יצחק'));
  await ctx.close();
}

/* ───── הרשאות בתוך העסק ───── */
{
  const ctx = await browser.newContext(phone);
  await authenticate(ctx, BASE, ACCOUNTS.worker);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${BASE}/#/team`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check('עובד שטח רואה את הצוות', await page.getByRole('heading', { name: 'עובדים', level: 2 }).isVisible());
  check('עובד שטח אינו יכול להוסיף עובדים',
    (await page.locator('.page').textContent()).includes('רק בעל העסק'));
  await page.goto(`${BASE}/#/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  check('עובד שטח נחסם מקונסולת הניהול',
    (await page.locator('.page').textContent()).includes('אין לך הרשאה'));
  await ctx.close();
}

/* ───── בעל עסק מוסיף עובד ───── */
{
  const ctx = await browser.newContext(phone);
  await authenticate(ctx, BASE, ACCOUNTS.owner);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${BASE}/#/team`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check('בעל העסק רואה כפתור הוספה', await page.getByRole('button', { name: '+ הוספת עובד' }).isVisible());
  await page.getByRole('button', { name: '+ הוספת עובד' }).click();
  await page.waitForTimeout(400);
  const email = `emp${Date.now()}@dev.local`;
  await page.getByLabel('שם העובד').fill('מדביר נוסף');
  await page.getByLabel('דוא״ל').fill(email);
  await page.getByLabel('סיסמה ראשונית').fill('Employee123');
  await page.getByRole('button', { name: 'הוספה' }).click();
  await page.waitForTimeout(1200);
  check('העובד נוסף לרשימה', await page.getByText('מדביר נוסף').first().isVisible());
  await ctx.close();
}

check('אין שגיאות דף', errs.length === 0, errs.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n=== ${results.length - failed}/${results.length} עברו ===`);
process.exit(failed ? 1 : 0);
