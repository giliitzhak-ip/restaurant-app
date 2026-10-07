/**
 * בדיקת קבלה: גיבוי ושחזור.
 *
 * זו הדרך להעביר נתונים למכשיר חדש או לשחזר אחרי אובדן מכשיר.
 * נבדק הקובץ עצמו, הייבוא במכשיר אחר, והכלל שייבוא אינו דורס.
 */

import fs from 'node:fs/promises';
import { chromium, devices } from 'playwright';
import { authenticate, createFreshBusiness } from './helpers.mjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const LAUNCH = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};

const results = [];
const check = (name, pass, detail = '') => {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'} · ${name}${detail ? ' · ' + detail : ''}`);
};

const appErrors = [];
const browser = await chromium.launch(LAUNCH);
const phone = { ...devices['iPhone 12'], locale: 'he-IL' };
const stamp = Date.now();
const NAMES = [`גיבוי אלפא ${stamp}`, `גיבוי בטא ${stamp}`];

/* ───── מכשיר א': יצירת נתונים וייצוא ───── */
const bizA = await createFreshBusiness(BASE, 'עסק גיבוי');
const ctxA = await browser.newContext(phone);
await authenticate(ctxA, BASE, bizA);
const pageA = await ctxA.newPage();
pageA.on('pageerror', (e) => appErrors.push('pageerror(A): ' + e.message));

await pageA.goto(BASE + '/#/customers', { waitUntil: 'networkidle' });
await pageA.waitForTimeout(700);
for (const name of NAMES) {
  await pageA.getByRole('button', { name: '+ לקוח חדש' }).click();
  await pageA.getByLabel('שם לקוח / עסק').fill(name);
  await pageA.getByLabel('כתובת', { exact: true }).fill('הרצל 1, תל אביב');
  await pageA.getByRole('button', { name: 'שמור', exact: true }).click();
  await pageA.waitForTimeout(700);
}

await pageA.goto(BASE + '/#/profile', { waitUntil: 'networkidle' });
await pageA.waitForTimeout(700);
const downloadPromise = pageA.waitForEvent('download');
await pageA.getByRole('button', { name: 'ייצוא גיבוי לקובץ' }).click();
const download = await downloadPromise;
const path = await download.path();
check('ייצוא יוצר קובץ להורדה', Boolean(path));
check('שם הקובץ כולל תאריך', /\d{4}-\d{2}-\d{2}/.test(download.suggestedFilename()),
  download.suggestedFilename());

const raw = await fs.readFile(path, 'utf8');
const parsed = JSON.parse(raw);
check('הקובץ נושא מזהה אפליקציה וגרסת מבנה',
  parsed.app === 'yomanhadbara' && typeof parsed.schemaVersion === 'number',
  `schemaVersion=${parsed.schemaVersion}`);
check('הקובץ כולל את הלקוחות שנוצרו',
  NAMES.every((n) => (parsed.state.customers ?? []).some((c) => c.name === n)));
check('הקובץ אינו נושא את מאגר התכשירים שמגיע עם הקוד',
  parsed.counts.materials === undefined && (parsed.state.materials ?? []).length === 0,
  `materials=${(parsed.state.materials ?? []).length}`);
check('המסך מדווח מה יוצא', (await pageA.locator('.page').textContent()).includes('הגיבוי נוצר'));

/* ───── מכשיר ב': ייבוא ───── */
const bizB = await createFreshBusiness(BASE, 'עסק יעד');
const ctxB = await browser.newContext(phone);
const authB = await authenticate(ctxB, BASE, bizB);
const pageB = await ctxB.newPage();
pageB.on('pageerror', (e) => appErrors.push('pageerror(B): ' + e.message));

await pageB.goto(BASE + '/#/customers', { waitUntil: 'networkidle' });
await pageB.waitForTimeout(2000);
check('מכשיר ב\' מתחיל בלי הלקוחות של א\'',
  !(await pageB.locator('.page').textContent()).includes(NAMES[0]));

await pageB.goto(BASE + '/#/profile', { waitUntil: 'networkidle' });
await pageB.waitForTimeout(700);
await pageB.getByLabel('בחירת קובץ גיבוי').setInputFiles(path);
await pageB.waitForTimeout(1500);
const reportB = await pageB.locator('.page').textContent();
check('הייבוא מדווח כמה נוספו', reportB.includes('הייבוא הושלם'), '');

await pageB.goto(BASE + '/#/customers', { waitUntil: 'networkidle' });
await pageB.waitForTimeout(1200);
const listB = await pageB.locator('.page').textContent();
check('הלקוחות מהגיבוי מופיעים במכשיר ב\'', NAMES.every((n) => listB.includes(n)));

/* הגיבוי הזה הוא של עסק אחר, ולכן השרת מסרב לכתוב את הרשומות
   שלו תחת עסק ב'. הנתונים נשארים במכשיר, והדחייה מוצגת למשתמש
   במקום להיעלם בשקט או לתקוע את תור הסנכרון. */
await pageB.waitForTimeout(2500);
const serverB = await (await fetch(`${BASE}/api/entities/customers?limit=500`, {
  headers: { Authorization: `Bearer ${authB.token}` },
})).json();
check('רשומות של עסק אחר אינן נכתבות תחת העסק הזה',
  !(serverB.items ?? []).some((c) => NAMES.includes(c.name)),
  `רשומות בשרת: ${(serverB.items ?? []).length}`);

const pillB = pageB.locator('.save-pill').first();
const pillText = (await pillB.textContent()) ?? '';
check('הדחייה מוצגת ואינה נעלמת', pillText.includes('לא נקלט'), pillText.trim());
await pillB.click();
await pageB.waitForTimeout(600);
const dialogText = (await pageB.locator('.dialog, [role="dialog"]').first().textContent()) ?? '';
check('הנימוק של השרת מוצג למשתמש', dialogText.includes('שייכת לעסק אחר'),
  dialogText.slice(0, 80));
check('הדיאלוג מבהיר שהנתונים לא אבדו', dialogText.includes('נשמרו במכשיר'));
await pageB.keyboard.press('Escape');
await pageB.waitForTimeout(400);

/* ───── ייבוא חוזר אינו מכפיל ואינו דורס ───── */
await pageB.goto(BASE + '/#/profile', { waitUntil: 'networkidle' });
await pageB.waitForTimeout(700);
await pageB.getByLabel('בחירת קובץ גיבוי').setInputFiles(path);
await pageB.waitForTimeout(1500);
const secondReport = await pageB.locator('.page').textContent();
check('ייבוא חוזר אינו מוסיף רשומות', secondReport.includes('לא נוספו רשומות'));
check('ייבוא חוזר מדווח על דילוג', secondReport.includes('דולגו'));

await pageB.goto(BASE + '/#/customers', { waitUntil: 'networkidle' });
await pageB.waitForTimeout(1000);
const rowsB = await pageB.locator('.list-row', { hasText: NAMES[0] }).count();
check('הלקוח לא הוכפל', rowsB === 1, `שורות: ${rowsB}`);

/* ───── קובץ שאינו גיבוי ───── */
const badPath = `${path}.bad.json`;
await fs.writeFile(badPath, JSON.stringify({ app: 'something-else', schemaVersion: 1, state: {} }));
await pageB.goto(BASE + '/#/profile', { waitUntil: 'networkidle' });
await pageB.waitForTimeout(700);
await pageB.getByLabel('בחירת קובץ גיבוי').setInputFiles(badPath);
await pageB.waitForTimeout(1200);
check('קובץ שאינו גיבוי נדחה בהסבר',
  (await pageB.locator('.page').textContent()).includes('הייבוא לא בוצע'));
await fs.unlink(badPath);

check('אין שגיאות דף', appErrors.length === 0, appErrors.join(' | '));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n=== ${passed}/${results.length} עברו ===`);
process.exit(passed === results.length ? 0 : 1);
