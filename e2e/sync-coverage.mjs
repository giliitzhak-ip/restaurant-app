/**
 * בדיקת קבלה ב: כל שינוי מגיע לשרת, ומכשיר שני רואה אותו.
 *
 * עד התיקון, 18 פעולות בחנות שינו רק את המכשיר ולא נרשמו בתור הסנכרון:
 * מזיקים, פעולות טיפול, תיבות האכלה, תחנות מסלול, משימות, תבניות, קבצים,
 * ביטול יומן ומחיקות. כאן נבדק מה שהשרת קיבל בפועל, ולא מה שמוצג במסך.
 */

import { chromium, devices } from 'playwright';
import { authenticate, createFreshBusiness } from './helpers.mjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const LAUNCH = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};

/* עסק חדש ומאושר לכל הרצה: האפליקציה מסנכרנת נתונים מהשרת,
   ובלי עסק נפרד הבדיקה הייתה רואה נתונים של הרצות קודמות. */
const BIZ = await createFreshBusiness(BASE);

const results = [];
const check = (name, pass, detail = '') => {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'} · ${name}${detail ? ' · ' + detail : ''}`);
};

const appErrors = [];
const browser = await chromium.launch(LAUNCH);
const phone = { ...devices['iPhone 12'], locale: 'he-IL' };
const stamp = Date.now();
const customerName = `לקוח סנכרון ${stamp}`;
const taskTitle = `משימת סנכרון ${stamp}`;

const ctxA = await browser.newContext(phone);
const auth = await authenticate(ctxA, BASE, BIZ);
const page = await ctxA.newPage();
page.on('pageerror', (e) => appErrors.push('pageerror: ' + e.message));

/** קורא ישות מהשרת. זו האמת היחידה שנבדקת כאן. */
const fromServer = async (entity) => {
  const res = await fetch(`${BASE}/api/entities/${entity}?limit=500`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  const body = await res.json();
  return body.items ?? [];
};
const settle = () => page.waitForTimeout(900);

/* ───── לקוח ויומן ───── */
await page.goto(BASE + '/#/customers', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.getByRole('button', { name: '+ לקוח חדש' }).click();
await page.getByLabel('שם לקוח / עסק').fill(customerName);
await page.getByLabel('כתובת', { exact: true }).fill('הברוש 12, חולון');
await page.getByRole('button', { name: 'שמור', exact: true }).click();
await settle();
await page.getByText(customerName).first().click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'פתח יומן ללקוח' }).click();
await page.waitForTimeout(600);
const journalId = page.url().match(/#\/journal\/([^/]+)/)?.[1];
check('נוצר יומן לבדיקה', Boolean(journalId), journalId ?? '—');

/* ───── מזיק (setJournalPest) ───── */
await page.goto(`${BASE}/#/journal/${journalId}/3`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.locator('[role="group"][aria-label="בחירת מזיקים"] .chip').first().click();
await settle();
const pests = await fromServer('journal_pests');
check('ב: בחירת מזיק הגיעה לשרת',
  pests.some((p) => p.journalId === journalId), `רשומות: ${pests.length}`);

/* ───── פעולת טיפול (toggleJournalAction) ───── */
await page.goto(`${BASE}/#/journal/${journalId}/4`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const actionsGroup = page.locator('.field', { hasText: 'פעולות הטיפול שבוצעו' }).first();
await actionsGroup.getByRole('button', { name: 'תיבות האכלה' }).click();
await settle();
const actions = await fromServer('journal_actions');
check('ב: פעולת טיפול הגיעה לשרת',
  actions.some((a) => a.journalId === journalId && a.kind === 'bait_stations'),
  `רשומות: ${actions.length}`);

/* ───── עדכון פעולת טיפול (updateJournalAction) ───── */
await page.locator('.field', { hasText: 'אזורי הטיפול' }).first().getByRole('button').first().click();
await settle();
const actionsAfter = await fromServer('journal_actions');
const withArea = actionsAfter.find((a) => a.journalId === journalId && a.kind === 'bait_stations');
check('ב: עדכון אזורי הטיפול הגיע לשרת',
  Array.isArray(withArea?.areas) && withArea.areas.length > 0,
  JSON.stringify(withArea?.areas ?? null));

/* ───── תיבת האכלה (upsertBaitStation) ───── */
await page.goto(`${BASE}/#/journal/${journalId}/5`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const addBox = page.getByRole('button', { name: '+ הוסף תיבה' });
if (await addBox.count()) {
  await addBox.first().click();
  await settle();
  const boxes = await fromServer('bait_stations');
  check('ב: תיבת האכלה הגיעה לשרת',
    boxes.some((b) => b.journalId === journalId), `רשומות: ${boxes.length}`);
} else {
  check('ב: תיבת האכלה הגיעה לשרת', false, 'כפתור "+ הוסף תיבה" לא נמצא בשלב 5');
}

/* ───── משימה (createTask + updateTask) ───── */
await page.goto(BASE + '/#/tasks', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.getByLabel('כותרת').fill(taskTitle);
await page.getByRole('button', { name: 'הוסף משימה' }).click();
await settle();
let tasks = await fromServer('tasks');
const created = tasks.find((t) => t.title === taskTitle);
check('ב: משימה חדשה הגיעה לשרת', Boolean(created));

const taskRow = page.locator('.list-row', { hasText: taskTitle }).first();
await taskRow.getByRole('button', { name: 'בוצע' }).click();
await settle();
tasks = await fromServer('tasks');
check('ב: סימון משימה כבוצעה הגיע לשרת',
  Boolean(tasks.find((t) => t.title === taskTitle)?.done),
  `done=${tasks.find((t) => t.title === taskTitle)?.done}`);

/* ───── תחנת מסלול (addRouteStop) ───── */
await page.goto(BASE + '/#/route', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const createRoute = page.getByRole('button', { name: 'צור מסלול ליום זה' });
if (await createRoute.count()) {
  await createRoute.click();
  await page.waitForTimeout(400);
}
const optionValue = await page.locator('#route-add option', { hasText: customerName })
  .first().getAttribute('value');
await page.getByLabel('הוספת לקוח למסלול').selectOption(optionValue);
await page.getByRole('button', { name: '+ הוסף תחנה' }).click();
await settle();
const customerId = (await fromServer('customers')).find((c) => c.name === customerName)?.id;
const stopsOfCustomer = async () =>
  (await fromServer('route_stops')).filter((st) => st.customerId === customerId);
check('ב: תחנת מסלול הגיעה לשרת', (await stopsOfCustomer()).length === 1,
  `תחנות ללקוח הבדיקה: ${(await stopsOfCustomer()).length}`);

/* ───── מכשיר שני: משיכה מהשרת ───── */
const ctxB = await browser.newContext(phone);
await authenticate(ctxB, BASE, BIZ);
const pageB = await ctxB.newPage();
pageB.on('pageerror', (e) => appErrors.push('pageerror(B): ' + e.message));
await pageB.goto(BASE + '/#/customers', { waitUntil: 'networkidle' });
await pageB.waitForTimeout(2500);   // טעינה ראשונית ואחריה משיכה מהשרת
check('ב: מכשיר שני רואה לקוח שנוצר במכשיר הראשון',
  await pageB.getByText(customerName).first().isVisible());

await pageB.goto(BASE + '/#/tasks', { waitUntil: 'networkidle' });
await pageB.waitForTimeout(1500);
check('ב: מכשיר שני רואה את המשימה', await pageB.getByText(taskTitle).first().isVisible());

/* ───── מחיקה מתפשטת בין מכשירים ───── */
await pageB.goto(BASE + '/#/route', { waitUntil: 'networkidle' });
await pageB.waitForTimeout(2000);
/* הכרטיס של התחנה שנוספה בבדיקה הזו, ולא תחנה אחרת שכבר במסלול */
const stopCardB = pageB.locator('.card')
  .filter({ has: pageB.getByRole('heading', { name: new RegExp(customerName) }) }).first();
check('ב: מכשיר שני רואה את תחנת המסלול של הלקוח', await stopCardB.count() > 0);

if (await stopCardB.count() > 0) {
  await stopCardB.getByRole('button', { name: 'הסר תחנה' }).click();
  await pageB.waitForTimeout(1500);
  check('ב: הסרת תחנה במכשיר השני הגיעה לשרת',
    (await stopsOfCustomer()).length === 0,
    `נשארו ${(await stopsOfCustomer()).length}`);

  /* מכשיר א' נשאר על אותו מסך: מעבר בין מסכים מפעיל משיכה,
     ואין צורך לסגור ולפתוח את האפליקציה כדי לראות מחיקה ממכשיר אחר. */
  await page.goto(BASE + '/#/tasks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.goto(BASE + '/#/route', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const stillOnA = await page.locator('.card')
    .filter({ has: page.getByRole('heading', { name: new RegExp(customerName) }) }).count();
  check('ב: המחיקה הגיעה גם למכשיר הראשון', stillOnA === 0, `כרטיסים שנשארו: ${stillOnA}`);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const afterReloadA = await page.locator('.card')
    .filter({ has: page.getByRole('heading', { name: new RegExp(customerName) }) }).count();
  check('ב: התחנה שנמחקה אינה חוזרת אחרי רענון', afterReloadA === 0, `כרטיסים: ${afterReloadA}`);
}

check('אין שגיאות דף', appErrors.length === 0, appErrors.join(' | '));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n=== ${passed}/${results.length} עברו ===`);
process.exit(passed === results.length ? 0 : 1);
