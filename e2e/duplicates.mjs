/**
 * בדיקות קבלה: מניעת כפילויות.
 *
 * כל בדיקה כאן סופרת את מה שהשרת קיבל בפועל, ולא רק את מה שמוצג
 * במסך – כפילות שנשמרה ואינה מוצגת היא בדיוק הבעיה שחיפשנו.
 */

import { chromium, devices } from 'playwright';
import { authenticate, createFreshBusiness, saveCustomerDialog } from './helpers.mjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const LAUNCH = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};
const BIZ = await createFreshBusiness(BASE, 'עסק כפילויות');

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
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('ERR_CERT') && !m.text().includes('Failed to load resource')) {
    appErrors.push(m.text());
  }
});
page.on('pageerror', (e) => appErrors.push('pageerror: ' + e.message));

const fromServer = async (entity) => {
  const res = await fetch(`${BASE}/api/entities/${entity}?limit=500`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  return (await res.json()).items ?? [];
};

/* ───── לחיצה כפולה על "יומן חדש" ───── */
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.locator('.nav-fab').dblclick();
await page.waitForTimeout(1800);
let journals = await fromServer('journals');
check('לחיצה כפולה על "יומן חדש" יצרה יומן אחד', journals.length === 1,
  `יומנים בשרת: ${journals.length}`);
check('ליומן יש מספר', journals[0]?.journalNumber === 1, `מספר: ${journals[0]?.journalNumber}`);

/* לחיצה נוספת מאוחר יותר על טיוטה שנשארה ריקה – פותחת אותה מחדש
   ואינה יוצרת טיוטה ריקה שנייה. */
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await page.locator('.nav-fab').click();
await page.waitForTimeout(1500);
journals = await fromServer('journals');
check('לחיצה חוזרת מאוחרת אינה יוצרת טיוטה ריקה שנייה', journals.length === 1,
  `יומנים בשרת: ${journals.length}`);

/* ───── לחיצה כפולה על שמירת לקוח חדש ───── */
await page.goto(BASE + '/#/customers', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.getByRole('button', { name: '+ לקוח חדש' }).click();
await page.getByLabel('שם לקוח / עסק').fill('מסעדת הכפילות');
await page.getByLabel('כתובת מלאה').fill('הרצל 10, תל אביב');
await page.getByLabel('טלפון').fill('050-1234567');
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'שמור', exact: true }).dblclick();
await page.waitForTimeout(1800);
let customers = await fromServer('customers');
check('לחיצה כפולה על שמירה יצרה לקוח אחד', customers.length === 1,
  `לקוחות בשרת: ${customers.length}`);
const firstCustomerNumber = customers[0]?.customerNumber;

/* ───── התראה על לקוח דומה ───── */
await page.goto(BASE + '/#/customers', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.getByRole('button', { name: '+ לקוח חדש' }).click();
await page.getByLabel('שם לקוח / עסק').fill('מסעדת הכפילות');
await page.getByLabel('כתובת מלאה').fill('הרצל 10, תל-אביב');
await page.waitForTimeout(600);
check('מוצגת התראה על לקוח דומה',
  (await page.locator('.dialog').textContent()).includes('קיים לקוח דומה'));
check('כפתור השמירה חסום עד אישור',
  await page.getByRole('button', { name: 'שמור', exact: true }).isDisabled());
check('מוצעת האפשרות להשתמש בלקוח הקיים',
  (await page.getByRole('button', { name: 'השתמש בלקוח הזה' }).count()) > 0);

await page.getByRole('checkbox').last().check();
await page.waitForTimeout(300);
check('אחרי אישור מפורש אפשר לשמור',
  await page.getByRole('button', { name: 'שמור', exact: true }).isEnabled());
// האישור כבר סומן למעלה, ולכן כאן לחיצה ישירה ולא העזר
await page.getByRole('button', { name: 'שמור', exact: true }).click();
await page.waitForTimeout(1500);
customers = await fromServer('customers');
check('לקוח דומה שאושר במפורש נשמר בנפרד ואינו ממוזג', customers.length === 2,
  `לקוחות: ${customers.length}`);
check('שני הלקוחות קיבלו מספרים שונים',
  new Set(customers.map((c) => c.customerNumber)).size === 2,
  customers.map((c) => c.customerNumber).join(' / '));
check('מספר הלקוח הראשון לא השתנה',
  customers.some((c) => c.customerNumber === firstCustomerNumber));

/* ───── חיפוש לקוחות אינו מציג כפילות ───── */
await page.goto(BASE + '/#/customers', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const rows = await page.locator('.list-row').count();
check('רשימת הלקוחות מציגה כל לקוח פעם אחת', rows === customers.length,
  `שורות: ${rows} · לקוחות: ${customers.length}`);

/* ───── כמה יומנים לאותו לקוח באותו יום – מותר ───── */
await page.getByText('מסעדת הכפילות').first().click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: 'פתח יומן ללקוח' }).click();
await page.waitForTimeout(1200);
const firstJournalUrl = page.url();
await page.goto(BASE + '/#/customers', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.getByText('מסעדת הכפילות').first().click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: 'פתח יומן ללקוח' }).click();
await page.waitForTimeout(1500);
check('הפעולה השנייה פתחה יומן אחר', page.url() !== firstJournalUrl);
journals = await fromServer('journals');
const forCustomer = journals.filter((j) => j.customerId);
check('אפשר לפתוח שני יומנים נפרדים לאותו לקוח באותו יום',
  forCustomer.length === 2, `יומנים ללקוח: ${forCustomer.length}`);
check('לכל היומנים מספרים ייחודיים',
  new Set(journals.map((j) => j.journalNumber)).size === journals.length,
  journals.map((j) => j.journalNumber).join(','));

/* ───── עריכה מעדכנת את אותו יומן ───── */
const editId = page.url().match(/#\/journal\/([^/]+)/)?.[1];
await page.getByLabel('מספר רישיון הדברה').fill('55555');
await page.waitForTimeout(1200);
journals = await fromServer('journals');
/* שניים: הטיוטה הריקה הראשונה נתפסה מחדש כשנפתח יומן ללקוח,
   ולכן לא נשארה טיוטה ריקה מיותרת. */
check('עריכה לא יצרה יומן נוסף', journals.length === 2, `יומנים: ${journals.length}`);
check('לא נשארו טיוטות ריקות',
  journals.every((j) => j.customerId), `ללא לקוח: ${journals.filter((j) => !j.customerId).length}`);
check('אין שני יומנים עם אותו מספר אחרי כל הפעולות',
  new Set(journals.map((j) => j.journalNumber)).size === journals.length,
  journals.map((j) => j.journalNumber).join(','));
check('העריכה נשמרה באותו יומן',
  journals.find((j) => j.id === editId)?.licenseNumber === '55555');

/* ───── מסלול: לחיצה כפולה אינה יוצרת שני מסלולים ───── */
await page.goto(BASE + '/#/route', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const createRouteButton = page.getByRole('button', { name: 'צור מסלול ליום זה' });
if (await createRouteButton.count()) {
  await createRouteButton.dblclick();
  await page.waitForTimeout(1800);
}
const routes = await fromServer('routes');
check('לחיצה כפולה יצרה מסלול אחד ליום', routes.length === 1, `מסלולים: ${routes.length}`);

/* ───── משימה: לחיצה כפולה ───── */
await page.goto(BASE + '/#/tasks', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.getByLabel('כותרת').fill('ביקורת חודשית');
await page.getByRole('button', { name: 'הוסף משימה' }).dblclick();
await page.waitForTimeout(1800);
const tasks = await fromServer('tasks');
check('לחיצה כפולה על "הוסף משימה" יצרה משימה אחת', tasks.length === 1,
  `משימות: ${tasks.length}`);

/* ───── טעינה מיומן קודם אינה מכפילה ───── */
await page.goto(BASE + '/#/journal/' + editId + '/5', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.getByRole('combobox', { name: 'חיפוש חומר' }).fill('דרגון');
await page.waitForTimeout(400);
await page.locator('.combo-results [role="option"]').first().click();
await page.waitForTimeout(900);
await page.getByLabel('מספר אצווה').first().fill('BATCH-1');
await page.waitForTimeout(900);

/* יומן חדש לאותו לקוח, וטעינה מהיומן הקודם פעמיים */
await page.goto(BASE + '/#/customers', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.getByText('מסעדת הכפילות').first().click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: 'פתח יומן ללקוח' }).click();
await page.waitForTimeout(1200);
const freshId = page.url().match(/#\/journal\/([^/]+)/)?.[1];
await page.goto(`${BASE}/#/journal/${freshId}/2`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

await page.getByRole('button', { name: 'טען מיומן אחרון' }).click();
await page.waitForTimeout(1500);
let materialsForFresh = (await fromServer('journal_materials')).filter((m) => m.journalId === freshId);
check('טעינה ראשונה העתיקה את החומר פעם אחת', materialsForFresh.length === 1,
  `חומרים: ${materialsForFresh.length}`);
check('נתוני הביצוע לא הועתקו ודורשים מילוי מחדש',
  !materialsForFresh[0]?.execution?.batchNumber, `אצווה: ${materialsForFresh[0]?.execution?.batchNumber ?? '—'}`);

await page.getByRole('button', { name: 'טען מיומן אחרון' }).click();
await page.waitForTimeout(800);
check('טעינה חוזרת מבקשת אישור לפני שהיא דורסת',
  (await page.locator('.dialog').textContent() ?? '').includes('מה יוחלף'));
await page.getByRole('button', { name: 'החלף את נתוני הטיוטה' }).click();
await page.waitForTimeout(1800);
materialsForFresh = (await fromServer('journal_materials')).filter((m) => m.journalId === freshId);
check('טעינה חוזרת לא הכפילה את החומרים', materialsForFresh.length === 1,
  `חומרים: ${materialsForFresh.length}`);

const sourceMaterials = (await fromServer('journal_materials')).filter((m) => m.journalId === editId);
check('היומן ההיסטורי לא השתנה',
  sourceMaterials.length === 1 && sourceMaterials[0].execution?.batchNumber === 'BATCH-1',
  `אצווה במקור: ${sourceMaterials[0]?.execution?.batchNumber ?? '—'}`);

/* ───── כשל רשת וניסיון חוזר אינם מכפילים ───── */
let dropped = false;
await page.route('**/api/sync', async (route) => {
  if (!dropped && route.request().method() === 'POST') {
    dropped = true;
    /* הבקשה מגיעה לשרת ונכתבת, אבל התשובה אובדת – בדיוק המצב שבו
       ניסיון חוזר עלול ליצור רשומה שנייה. */
    await route.fetch().catch(() => {});
    await route.abort('failed');
    return;
  }
  await route.continue();
});

const before = (await fromServer('tasks')).length;
await page.goto(BASE + '/#/tasks', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await page.getByLabel('כותרת').fill('משימה אחרי כשל רשת');
await page.getByRole('button', { name: 'הוסף משימה' }).click();
await page.waitForTimeout(2500);
await page.unroute('**/api/sync');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const afterRetry = await fromServer('tasks');
check('כשל רשת וניסיון חוזר יצרו רשומה אחת',
  afterRetry.length === before + 1, `לפני ${before} אחרי ${afterRetry.length}`);
check('המשימה אכן נשמרה', afterRetry.some((t) => t.title === 'משימה אחרי כשל רשת'));

check('אין שגיאות דף', appErrors.length === 0, appErrors.slice(0, 3).join(' | '));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n=== ${passed}/${results.length} עברו ===`);
process.exit(passed === results.length ? 0 : 1);
