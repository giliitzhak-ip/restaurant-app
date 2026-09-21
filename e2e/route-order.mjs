import { chromium, devices } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
/** אפשר להצביע על דפדפן מותקן מראש: CHROME_PATH=/path/to/chrome */
const LAUNCH = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};

const results = [];
const check = (n, p, d = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'} · ${n}${d ? ' · ' + d : ''}`); };

const browser = await chromium.launch(LAUNCH);
const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'he-IL' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

await page.goto(BASE + '/#/customers', { waitUntil: 'networkidle' });
for (const [name, address] of [
  ['גמא', 'הרצל 22, תל אביב'],
  ['אלפא', 'האלון 3, חיפה'],
  ['בטא', 'הרצל 4, תל אביב'],
]) {
  await page.getByRole('button', { name: '+ לקוח חדש' }).click();
  await page.getByLabel('שם לקוח / עסק').fill(name);
  await page.getByLabel('כתובת', { exact: true }).fill(address);
  await page.getByRole('button', { name: 'שמור', exact: true }).click();
  await page.waitForTimeout(350);
}

await page.goto(BASE + '/#/route', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'צור מסלול ליום זה' }).click();
await page.waitForTimeout(300);
for (const name of ['גמא', 'אלפא', 'בטא']) {
  const value = await page.locator('#route-add option', { hasText: name }).first().getAttribute('value');
  await page.getByLabel('הוספת לקוח למסלול').selectOption(value);
  await page.getByRole('button', { name: '+ הוסף תחנה' }).click();
  await page.waitForTimeout(250);
}

const order = async () => page.locator('.reorder-row .bold').allTextContents();
check('3 תחנות נוספו למסלול', (await order()).length === 3, (await order()).join(' | '));

// סדר מומלץ לפי כתובות: חיפה לפני תל אביב, ובתוך הרחוב לפי מספר בית
await page.getByRole('button', { name: 'סדר מומלץ לפי כתובות' }).click();
await page.waitForTimeout(400);
const suggested = await order();
check('סדר מומלץ מקבץ לפי עיר, רחוב ומספר בית',
  suggested[0].includes('אלפא') && suggested[1].includes('בטא') && suggested[2].includes('גמא'),
  suggested.join(' | '));

// גרירה במגע (Pointer Events) – התחנה הראשונה יורדת למקום השני
const handles = page.locator('.drag-handle');
await handles.nth(0).scrollIntoViewIfNeeded();
await page.waitForTimeout(250);
const from = await handles.nth(0).boundingBox();
const to = await handles.nth(1).boundingBox();
await page.mouse.move(from.x + 20, from.y + 20);
await page.mouse.down();
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(from.x + 20, from.y + 20 + ((to.y - from.y) * i) / 10);
  await page.waitForTimeout(35);
}
await page.mouse.up();
await page.waitForTimeout(500);
const dragged = await order();
check('גרירה משנה את סדר התחנות', dragged[1].includes('אלפא'), dragged.join(' | '));

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(900);
const persisted = await order();
check('הסדר נשמר אחרי רענון', persisted.join() === dragged.join(), persisted.join(' | '));

// שינוי סדר במקלדת מהידית
await handles.nth(0).focus();
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(400);
const afterKeys = await order();
check('חצי מקלדת משנים סדר (נגישות)', afterKeys.join() !== persisted.join(), afterKeys.join(' | '));

check('אין שגיאות דף', errs.length === 0, errs.join(' | '));

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n=== ${results.length - failed}/${results.length} עברו ===`);
process.exit(failed ? 1 : 0);
