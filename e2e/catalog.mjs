/**
 * שתי הדרישות: תוצאה כבר מהאות הראשונה, ומילוי אוטומטי של
 * החומר הפעיל ואחוזו בעת בחירת התכשיר.
 *
 * רץ על המאגר הרשמי שיובא מ-data.gov.il יחד עם ארבעת התכשירים
 * שהוזנו ידנית.
 */

import { chromium, devices } from 'playwright';
import { authenticate } from './helpers.mjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const LAUNCH = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};
const results = [];
const check = (n, p, d = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'} · ${n}${d ? ' · ' + d : ''}`); };

const browser = await chromium.launch(LAUNCH);
const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'he-IL' });
await authenticate(ctx, BASE);
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

await page.goto(`${BASE}/#/customers`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: '+ לקוח חדש' }).click();
await page.getByLabel('שם לקוח / עסק').fill('בדיקת מאגר');
await page.getByLabel('כתובת', { exact: true }).fill('רחוב 1');
await page.getByRole('button', { name: 'שמור', exact: true }).click();
await page.waitForTimeout(500);
await page.locator('.nav-fab').click();
await page.waitForTimeout(500);
for (const s of [2, 3, 4, 5]) {
  await page.getByRole('button', { name: new RegExp(`המשך לשלב ${s}`) }).click();
  await page.waitForTimeout(250);
}

const input = () => page.getByRole('combobox', { name: 'חיפוש חומר' });
/* תוצאות החיפוש בלבד. אסור להשתמש ב-getByRole('option') גלובלי:
   ברגע שקיים כרטיס חומר, גם ה-<option> שבבורר התבנית נתפס. */
const options = () => page.locator('.combo-results [role="option"]');

check('אין רשימה פתוחה לפני הקלדה', (await options().count()) === 0);

/* ───── אות אחת ───── */
await input().fill('ד');
await page.waitForTimeout(350);
const oneLetter = await options().allTextContents();
check('אות אחת כבר מציגה תוצאות', oneLetter.length > 0, `${oneLetter.length} תוצאות`);
check('התוצאות רלוונטיות לאות שהוקלדה',
  oneLetter.some((t) => t.includes('דרגון')) && oneLetter.some((t) => t.includes('דרקר')),
  oneLetter.map((t) => t.split('מידע')[0].trim()).join(' | '));

/* ───── אחוז החומר הפעיל כבר בתוצאה ───── */
check('אחוז החומר הפעיל מוצג כבר בתוצאת החיפוש',
  oneLetter.some((t) => t.includes('9.6%')),
  oneLetter.find((t) => t.includes('9.6%'))?.trim().slice(0, 80) ?? '');

/* ───── בחירה → מילוי אוטומטי ───── */
await input().fill('דרגון');
await page.waitForTimeout(350);
await options().first().tap();
await page.waitForTimeout(700);

const card = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'דרגון' }) }).first();
const cardText = (await card.textContent()) ?? '';
check('כרטיס התכשיר נפתח', await card.isVisible());
check('שם החומר הפעיל מולא אוטומטית', cardText.includes('Bifenthrin'));
check('אחוז החומר הפעיל מולא אוטומטית', cardText.includes('9.6%'));
check('מספר הרישום מולא אוטומטית', cardText.includes('640'));

/* ───── חיפוש לפי חומר פעיל ולפי מספר רישום ───── */
await input().fill('Cypermethrin');
await page.waitForTimeout(350);
const byIngredient = await options().allTextContents();
check('חיפוש לפי שם החומר הפעיל מחזיר תוצאות', byIngredient.length > 0,
  `${byIngredient.length} תוצאות`);
check('כל תוצאה אכן מכילה את החומר הפעיל שחופש',
  byIngredient.length > 0 && byIngredient.every((t) => /cypermethrin/i.test(t)),
  byIngredient.map((t) => t.split('מידע')[0].trim()).slice(0, 4).join(' | '));

await input().fill('584');
await page.waitForTimeout(350);
const byReg = await options().allTextContents();
check('חיפוש לפי מספר רישום', byReg.some((t) => t.includes('פסטיון')),
  byReg[0]?.split('מידע')[0].trim() ?? 'אין תוצאות');

/* ───── שני חומרים פעילים מוצגים במלואם ───── */
await input().fill('דרקר');
await page.waitForTimeout(350);
await options().first().tap();
await page.waitForTimeout(700);
const drakerCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'דרקר 10.2' }) }).first();
const drakerText = (await drakerCard.textContent()) ?? '';
check('כל החומרים הפעילים ואחוזיהם מולאו',
  drakerText.includes('Cypermethrin 10%') && drakerText.includes('Tetramethrin 2%')
  && drakerText.includes('Piperonyl Butoxide 10%'));

/* ───── המאגר הרשמי נטען ───── */
// כל אות נפוצה אמורה להחזיר תוצאות מהמאגר הרשמי
const letters = ['ס', 'ב', 'ק', 'ר', 'מ'];
let lettersWithResults = 0;
for (const letter of letters) {
  await input().fill(letter);
  await page.waitForTimeout(300);
  if ((await options().count()) > 0) lettersWithResults += 1;
}
check('כל אות נפוצה מחזירה תוצאות מהמאגר הרשמי',
  lettersWithResults === letters.length, `${lettersWithResults}/${letters.length}`);

// תכשיר מהמאגר הרשמי (אינו אחד מארבעת הידניים)
await input().fill('סנו');
await page.waitForTimeout(350);
const sano = await options().allTextContents();
check('תכשירים מהמאגר הרשמי נמצאים בחיפוש', sano.length > 0,
  sano[0]?.split('מידע')[0].trim() ?? 'אין תוצאות');
check('לתכשיר מהמאגר הרשמי מוצג אחוז חומר פעיל',
  sano.some((t) => /\d+\.\d+%/.test(t)),
  sano[0]?.replace(/\s+/g, ' ').slice(0, 90) ?? '');

check('אין שגיאות דף', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n=== ${results.length - failed}/${results.length} עברו ===`);
process.exit(failed ? 1 : 0);
