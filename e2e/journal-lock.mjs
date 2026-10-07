/**
 * בדיקת קבלה ג: יומן שהושלם נעול, והמסמך מופק מצילום בלתי-משתנה.
 *
 * עד התיקון אפשר היה להמשיך לערוך יומן שנחתם ונמסר ללקוח, והמסמך
 * הופק מהמצב הנוכחי – כך שעדכון שם תכשיר או פרטי לקוח שינה בדיעבד
 * מסמך שכבר נמסר.
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

const fromServer = async (entity) => {
  const res = await fetch(`${BASE}/api/entities/${entity}?limit=500`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  return (await res.json()).items ?? [];
};

const CUSTOMER = 'מסעדת הנעילה';
const CONTACT_BEFORE = 'איש קשר מקורי';
const CONTACT_AFTER = 'איש קשר אחרי הסיום';

/* ───── לקוח ויומן מלא ───── */
await page.goto(BASE + '/#/customers', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.getByRole('button', { name: '+ לקוח חדש' }).click();
await page.getByLabel('שם לקוח / עסק').fill(CUSTOMER);
await page.getByLabel('כתובת', { exact: true }).fill('הזיתים 8, רעננה');
await page.getByRole('button', { name: 'שמור', exact: true }).click();
await page.waitForTimeout(600);
await page.getByText(CUSTOMER).first().click();
await page.waitForTimeout(400);
// איש קשר לפני הסיום – נבדוק בהמשך שהמסמך ממשיך להציג אותו
await page.getByLabel('איש קשר').fill(CONTACT_BEFORE);
await page.waitForTimeout(600);
await page.getByRole('button', { name: 'פתח יומן ללקוח' }).click();
await page.waitForTimeout(700);
const journalId = page.url().match(/#\/journal\/([^/]+)/)?.[1];

// שלב 1: רישיון
await page.getByLabel('מספר רישיון הדברה').fill('12345');
await page.waitForTimeout(300);
await page.getByRole('button', { name: /המשך לשלב 2/ }).click();
await page.waitForTimeout(400);

// שלב 2: כתובת האתר כבר מהלקוח
const address = await page.getByLabel('כתובת מלאה של האתר').inputValue();
if (!address.trim()) await page.getByLabel('כתובת מלאה של האתר').fill('הזיתים 8, רעננה');
await page.getByRole('button', { name: /המשך לשלב 3/ }).click();
await page.waitForTimeout(400);

// שלב 3: מזיק
await page.locator('[role="group"][aria-label="בחירת מזיקים"] .chip').first().click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /המשך לשלב 4/ }).click();
await page.waitForTimeout(400);

// שלב 4: פעולת טיפול
await page.locator('.field', { hasText: 'פעולות הטיפול שבוצעו' }).first()
  .getByRole('button', { name: 'ריסוס' }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /המשך לשלב 5/ }).click();
await page.waitForTimeout(500);

// שלב 5: חומר ונתוני ביצוע
await page.getByRole('combobox', { name: 'חיפוש חומר' }).fill('דרגון');
await page.waitForTimeout(400);
await page.locator('.combo-results [role="option"]').first().click();
await page.waitForTimeout(600);
await page.getByLabel('מספר אצווה').first().fill('LOCK-1');
await page.getByLabel('תאריך תפוגה שעל האריזה').first().fill('2027-03-03');
await page.getByLabel('המינון שנבחר בפועל').first().fill('10 מ"ל ל-1 ליטר');
await page.getByLabel('כמות חומר בפועל').first().fill('30');
await page.getByLabel('היקף הטיפול').first().fill('80');
await page.waitForTimeout(700);

// שלב 8: חתימות, אישור וסיום
await page.goto(`${BASE}/#/journal/${journalId}/8`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
const drawOn = async (locator) => {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const midY = box.y + box.height / 2;
  await page.mouse.move(box.x + 20, midY);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) {
    await page.mouse.move(box.x + 20 + i * 12, midY + (i % 2 ? -10 : 10));
  }
  await page.mouse.up();
  await page.waitForTimeout(600);
};
await drawOn(page.locator('canvas[aria-label*="חתימת המדביר"]'));
await drawOn(page.locator('canvas[aria-label*="חתימת הלקוח"]'));
await page.getByRole('checkbox').first().check();
await page.waitForTimeout(600);

const finishButton = page.getByRole('button', { name: 'שמירה סופית' });
check('ג: כפתור השמירה הסופית פעיל כשהיומן מלא', await finishButton.isEnabled());
await finishButton.click();
await page.waitForTimeout(1500);
check('ג: היומן הושלם', await page.getByRole('button', { name: 'היומן הושלם' }).isVisible());

/* ───── הנעילה ───── */
await page.goto(`${BASE}/#/journal/${journalId}/1`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
check('ג: מוצגת הודעת נעילה', await page.getByText('היומן נעול לעריכה').first().isVisible());
check('ג: שדה בשלב 1 אינו ניתן לעריכה',
  await page.getByLabel('מספר רישיון הדברה').isDisabled());

await page.goto(`${BASE}/#/journal/${journalId}/4`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const sprayChip = page.locator('.field', { hasText: 'פעולות הטיפול שבוצעו' }).first()
  .getByRole('button', { name: 'ריסוס' });
check('ג: צ\'יפ פעולה בשלב 4 אינו ניתן ללחיצה', await sprayChip.isDisabled());

await page.goto(`${BASE}/#/journal/${journalId}/8`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
check('ג: אין כפתור "נקה חתימה" ביומן נעול',
  (await page.getByRole('button', { name: 'נקה חתימה' }).count()) === 0);

/* ───── הצילום ───── */
const snapshots = await fromServer('journal_snapshots');
const snapshot = snapshots.find((sn) => sn.journalId === journalId);
check('ג: הצילום נשמר והגיע לשרת', Boolean(snapshot), `צילומים: ${snapshots.length}`);
check('ג: הצילום כולל את נתוני הביצוע',
  snapshot?.full?.materials?.[0]?.execution?.batchNumber === 'LOCK-1',
  snapshot?.full?.materials?.[0]?.execution?.batchNumber ?? '—');
check('ג: הצילום אינו נושא את תוכן הקבצים המצורפים',
  Array.isArray(snapshot?.full?.attachments));

await page.goto(`${BASE}/#/doc/${journalId}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
check('ג: המסמך מצהיר שהוא מופק מצילום',
  (await page.locator('.page').textContent()).includes('מסמך סופי'));
const docBefore = await page.locator('.doc').textContent();
check('ג: המסמך מציג את פרטי הלקוח שבצילום',
  docBefore.includes(CUSTOMER) && docBefore.includes(CONTACT_BEFORE));

/* עריכת כרטיס הלקוח אחרי הסיום אינה משנה את המסמך שנמסר */
await page.goto(BASE + '/#/customers', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.getByText(CUSTOMER).first().click();
await page.waitForTimeout(500);
await page.getByLabel('איש קשר').fill(CONTACT_AFTER);
await page.waitForTimeout(900);
check('ג: עריכת כרטיס הלקוח עצמה נשמרה',
  (await page.getByLabel('איש קשר').inputValue()) === CONTACT_AFTER);

await page.goto(`${BASE}/#/doc/${journalId}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const docAfter = await page.locator('.doc').textContent();
check('ג: המסמך ממשיך להציג את הפרטים שבצילום',
  docAfter.includes(CONTACT_BEFORE) && !docAfter.includes(CONTACT_AFTER),
  docAfter.includes(CONTACT_AFTER) ? 'המסמך הושפע מעריכה מאוחרת' : 'ללא שינוי');

check('אין שגיאות דף', appErrors.length === 0, appErrors.join(' | '));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n=== ${passed}/${results.length} עברו ===`);
process.exit(passed === results.length ? 0 : 1);
