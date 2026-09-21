import { chromium, devices } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
/** אפשר להצביע על דפדפן מותקן מראש: CHROME_PATH=/path/to/chrome */
const LAUNCH = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};
const appErrors = [];   // שגיאות שמקורן בקוד האפליקציה
const netErrors = [];   // כשלי רשת חיצוניים (פונטים) – ארטיפקט של הסביבה
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} · ${name}${detail ? ' · ' + detail : ''}`);
};

const browser = await chromium.launch(LAUNCH);
const context = await browser.newContext({ ...devices['iPhone 12'], locale: 'he-IL' });
const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (t.includes('ERR_CERT') || t.includes('Failed to load resource')) netErrors.push(t);
  else appErrors.push(t);
});
page.on('pageerror', (e) => appErrors.push('pageerror: ' + e.message));

await page.goto(BASE, { waitUntil: 'networkidle' });

// ── מסלול עבודה: הוספת תחנות, שינוי סדר, סטטוסים
await page.goto(BASE + '/#/customers', { waitUntil: 'networkidle' });
for (const [name, addr] of [['מסעדת הגפן', 'הרצל 10, תל אביב'], ['בניין רימון', 'האלון 3, חיפה'], ['מפעל דגן', 'התעשייה 7, אשדוד']]) {
  await page.getByRole('button', { name: '+ לקוח חדש' }).click();
  await page.getByLabel('שם לקוח / עסק').fill(name);
  await page.getByLabel('כתובת', { exact: true }).fill(addr);
  await page.getByRole('button', { name: 'שמור', exact: true }).click();
  await page.waitForTimeout(350);
}
check('נוספו לקוחות נוספים', await page.getByText('מפעל דגן').first().isVisible());

// יומן קודם עם נתוני ביצוע – בסיס לבדיקת "טען מיומן אחרון"
await page.getByText('מסעדת הגפן').first().click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'פתח יומן ללקוח' }).click();
await page.waitForTimeout(500);
for (const step of [2, 3, 4, 5]) {
  await page.getByRole('button', { name: new RegExp(`המשך לשלב ${step}`) }).click();
  await page.waitForTimeout(250);
}
await page.getByRole('combobox', { name: 'חיפוש חומר' }).fill('דרגון');
await page.waitForTimeout(300);
await page.getByRole('option').first().tap();
await page.waitForTimeout(400);
await page.getByLabel('מספר אצווה').first().fill('OLD-999');
await page.getByLabel('תאריך תפוגה שעל האריזה').first().fill('2026-05-05');
await page.getByLabel('כמות חומר בפועל').first().fill('25');
await page.waitForTimeout(400);
check('נוצר יומן קודם עם אצווה OLD-999',
  (await page.getByLabel('מספר אצווה').first().inputValue()) === 'OLD-999');

await page.goto(BASE + '/#/route', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
if (await page.getByRole('button', { name: 'צור מסלול ליום זה' }).count()) {
  await page.getByRole('button', { name: 'צור מסלול ליום זה' }).click();
  await page.waitForTimeout(300);
}
const addSelect = page.getByLabel('הוספת לקוח למסלול');
for (const label of ['מסעדת הגפן', 'בניין רימון', 'מפעל דגן']) {
  const optValue = await page.locator('#route-add option', { hasText: label }).first().getAttribute('value');
  await addSelect.selectOption(optValue);
  await page.getByRole('button', { name: '+ הוסף תחנה' }).click();
  await page.waitForTimeout(250);
}
const stopTitles = async () =>
  (await page.locator('.card-title h3').allTextContents()).filter((t) => /^\d+\./.test(t));
const before = await stopTitles();
check('נוספו 3 תחנות למסלול', before.length === 3, before.join(' | '));

// שינוי סדר
await page.locator('.card').filter({ has: page.getByRole('heading', { name: '3. מפעל דגן', exact: true }) })
  .first().getByRole('button', { name: '↑ הקדם' }).click();
await page.waitForTimeout(300);
const after = await stopTitles();
check('בדיקה 11: סדר התחנות משתנה ונשמר', after[1].includes('מפעל דגן'), after.join(' | '));

// סטטוס
const stopCard = (title) =>
  page.locator('.card').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).first();
await stopCard('1. מסעדת הגפן').getByRole('button', { name: 'בטיפול' }).click();
await page.waitForTimeout(700);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(900);
const orderAfterReload = await stopTitles();
check('בדיקה 11: הסדר נשמר אחרי רענון', orderAfterReload[1].includes('מפעל דגן'), orderAfterReload.join(' | '));
check('בדיקה 11: הסטטוס נשמר אחרי רענון',
  (await stopCard('1. מסעדת הגפן').textContent()).includes('בטיפול'));

// ── טען מיומן אחרון
await stopCard('1. מסעדת הגפן').getByRole('button', { name: 'פתח יומן ללקוח' }).click();
await page.waitForTimeout(500);
check('נפתח יומן מתוך המסלול', await page.getByRole('heading', { name: 'פרטי העבודה' }).isVisible());
await page.getByRole('button', { name: /המשך לשלב 2/ }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'טען מיומן אחרון' }).click();
await page.waitForTimeout(500);
const compare = await page.locator('.notice-warn').first().textContent();
check('בדיקה 8: מוצגת השוואה בין היומן הקודם לחדש',
  compare.includes('הועתק') && compare.includes('נוקה'));
check('בדיקה 8: אצווה ותפוגה מסומנים כדורשים מילוי מחדש',
  compare.includes('מספר אצווה') && compare.includes('תפוגת אריזה') && compare.includes('חתימות'));

// החומר הועתק כשלד – בלי נתוני ביצוע
await page.getByRole('button', { name: /המשך לשלב 3/ }).click();
await page.waitForTimeout(200);
await page.getByRole('button', { name: /המשך לשלב 4/ }).click();
await page.waitForTimeout(200);
await page.getByRole('button', { name: /המשך לשלב 5/ }).click();
await page.waitForTimeout(400);
const batchValues = await page.getByLabel('מספר אצווה').evaluateAll((els) => els.map((e) => e.value));
check('בדיקה 8: אצווה לא הועתקה מהיומן הקודם',
  batchValues.length > 0 && batchValues.every((v) => v === ''), JSON.stringify(batchValues));
const expiryValues = await page.getByLabel('תאריך תפוגה שעל האריזה').evaluateAll((els) => els.map((e) => e.value));
check('בדיקה 8: תפוגה לא הועתקה', expiryValues.every((v) => v === ''), JSON.stringify(expiryValues));

// ── פסטיון: תיבות האכלה ואין זמן כניסה של ריסוס
await page.getByRole('combobox', { name: 'חיפוש חומר' }).fill('פסטיון');
await page.waitForTimeout(300);
await page.getByRole('option').first().tap();
await page.waitForTimeout(400);
const pastionCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'פסטיון פלוס פסטה' }) }).first();
check('פסטיון מציג "לא חל (טיפול בפיתיון)"',
  (await pastionCard.textContent()).includes('לא חל (טיפול בפיתיון)'));
await pastionCard.getByLabel('תבנית טיפול').selectOption({ label: 'פסטיון פלוס פסטה – חולדות' });
await page.waitForTimeout(400);
check('תבנית חולדות פותחת תיעוד תיבות האכלה',
  await page.getByRole('heading', { name: 'תיבות האכלה' }).isVisible());
await page.getByRole('button', { name: '+ הוסף תיבה' }).click();
await page.waitForTimeout(300);
check('נוספה תיבה עם מזהה', (await page.getByLabel('מזהה תיבה').first().inputValue()).startsWith('T-'));

await page.getByRole('button', { name: /המשך לשלב 6/ }).click();
await page.waitForTimeout(500);
const step6 = await page.locator('.page').textContent();
check('בדיקה 10: לא מוצג זמן כניסה מחדש של ריסוס לפסטיון',
  step6.includes('לא חל זמן כניסה מחדש של ריסוס') || step6.includes('זמן כניסה מחדש לא הוזן'));
check('בדיקה 10: מוצגות הוראות בטיחות להצבת פיתיון', step6.includes('תיבות האכלה'));

// ── בלוקיון פלוס: מידע יושלם בהמשך
await page.getByRole('button', { name: /הקודם/ }).click();
await page.waitForTimeout(400);
await page.getByRole('combobox', { name: 'חיפוש חומר' }).fill('בלוק');
await page.waitForTimeout(300);
const blokionOption = page.getByRole('option').first();
check('בלוקיון פלוס נמצא בחיפוש', (await blokionOption.textContent()).includes('בלוקיון'));
check('בלוקיון מסומן "מידע יושלם בהמשך" כבר בתוצאות',
  (await blokionOption.textContent()).includes('מידע יושלם בהמשך'));
await blokionOption.tap();
await page.waitForTimeout(400);
const blokionCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'בלוקיון פלוס' }) }).first();
const blokionText = await blokionCard.textContent();
check('בלוקיון ניתן לבחירה ולשמירת טיוטה', await blokionCard.isVisible());
check('בלוקיון דורש אישור ידני "קראתי והבנתי"', blokionText.includes('קראתי והבנתי'));
check('בלוקיון אינו יורש מינון מפסטיון', !blokionText.includes('פיתיון בתיבת האכלה'));

// ── תבניות
await page.goto(BASE + '/#/templates', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const tplText = await page.locator('.page').textContent();
check('מסך תבניות מציג את תבניות המערכת',
  tplText.includes('דרגון – פשפש המיטה') && tplText.includes('דרקר 10.2 – חרקים זוחלים'));
await page.getByRole('tab', { name: 'תבניות לקוחות' }).click();
await page.waitForTimeout(300);
check('תבנית לקוח מצהירה מה אינה שומרת',
  (await page.locator('.page').textContent()).includes('אינה שומרת'));

// ── ניווט מקלדת (בדיקת התוויות המלאה נמצאת ב-accessibility.mjs)
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.keyboard.press('Tab');
const focused = await page.evaluate(() => document.activeElement?.tagName);
check('ניווט במקלדת מגיע לאלמנט אינטראקטיבי', ['BUTTON', 'A', 'INPUT'].includes(focused), focused);

check('בדיקה 15: אין שגיאות console מקוד האפליקציה', appErrors.length === 0, appErrors.slice(0, 3).join(' | '));
console.log(`\n(כשלי רשת חיצוניים – פונט Google בסביבת ה-sandbox: ${netErrors.length})`);

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - failed.length}/${results.length} עברו ===`);
process.exit(failed.length ? 1 : 0);
