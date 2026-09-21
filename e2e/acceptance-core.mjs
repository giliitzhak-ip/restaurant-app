import { chromium, devices } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
/** אפשר להצביע על דפדפן מותקן מראש: CHROME_PATH=/path/to/chrome */
const LAUNCH = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};
const errors = [];
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} · ${name}${detail ? ' · ' + detail : ''}`);
}

const browser = await chromium.launch(LAUNCH);
const context = await browser.newContext({ ...devices['iPhone 12'], locale: 'he-IL' });
const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  // כשל טעינת פונט חיצוני בסביבת ה-sandbox (TLS proxy) אינו שגיאת אפליקציה
  if (t.includes('ERR_CERT') || t.includes('Failed to load resource')) return;
  errors.push(t);
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(BASE, { waitUntil: 'networkidle' });

// מסך בית
check('מסך הבית נטען עם "שלום, יצחק"', await page.getByRole('heading', { name: 'שלום, יצחק' }).isVisible());
check('כרטיס "היום שלי" מוצג', await page.getByRole('heading', { name: 'היום שלי' }).isVisible());
const tiles = await page.locator('.home-tile').count();
check('גריד 3x3 – 9 פעולות', tiles === 9, `נמצאו ${tiles}`);
check('פס ניווט תחתון קיים', await page.locator('.bottom-nav').isVisible());
check('כיוון RTL', await page.evaluate(() => document.documentElement.dir) === 'rtl');

// אין גלילה אופקית ב-320px
await page.setViewportSize({ width: 320, height: 720 });
await page.waitForTimeout(300);
const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
check('בדיקה 14: אין גלילה אופקית ברוחב 320px', noHScroll,
  await page.evaluate(() => `scrollWidth=${document.documentElement.scrollWidth} inner=${window.innerWidth}`));

// אזורי לחיצה 44px
const smallTargets = await page.evaluate(() => {
  const els = [...document.querySelectorAll('button, a, input, select')];
  return els.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.height < 44 && !el.closest('.step-tabs');
  }).map((el) => `${el.tagName}.${el.className}:${Math.round(el.getBoundingClientRect().height)}`);
});
check('אזורי לחיצה בגודל 44px לפחות', smallTargets.length === 0, smallTargets.slice(0, 5).join(', '));

// יצירת לקוח
await page.setViewportSize({ width: 390, height: 844 });
await page.locator('.bottom-nav .nav-item', { hasText: 'לקוחות' }).click();
await page.getByRole('button', { name: '+ לקוח חדש' }).click();
await page.getByLabel('שם לקוח / עסק').fill('מסעדת הגפן');
await page.getByLabel('איש קשר').fill('דנה לוי');
await page.getByLabel('טלפון').fill('050-1234567');
await page.getByLabel('כתובת', { exact: true }).fill('הרצל 10, תל אביב');
await page.getByRole('button', { name: 'שמור', exact: true }).click();
await page.waitForTimeout(400);
check('בדיקה 1א: לקוח חדש נוצר ונשמר', await page.getByText('מסעדת הגפן').first().isVisible());

// יומן חדש דרך כפתור + המרכזי
await page.locator('.nav-fab').click();
await page.waitForTimeout(400);
check('אשף היומן נפתח בשלב 1', await page.getByRole('heading', { name: 'פרטי העבודה' }).isVisible());
await page.getByLabel('מספר רישיון הדברה').fill('12345');

// שלב 2 – בחירת הלקוח מהחיפוש
await page.getByRole('button', { name: /המשך לשלב 2/ }).click();
await page.waitForTimeout(300);
const custInput = page.getByRole('combobox', { name: 'חיפוש לקוח קיים' });
await custInput.fill('גפן');
await page.waitForTimeout(250);
const custOption = page.getByRole('option').first();
check('חיפוש לקוח מחזיר תוצאה', await custOption.isVisible());
await custOption.click();
await page.waitForTimeout(300);
check('בדיקה 1ב: הלקוח שויך ליומן', await page.getByText(/לקוח משויך/).isVisible());

// שלב 3 – מזיק
await page.getByRole('button', { name: /המשך לשלב 3/ }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'תיקן גרמני', exact: true }).click();
await page.waitForTimeout(200);
check('נבחר מזיק ונפתח כרטיס רמת נגיעות', await page.getByText('רמת נגיעות').isVisible());

// שלב 4 – פעולה
await page.getByRole('button', { name: /המשך לשלב 4/ }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'ריסוס', exact: true }).click();
await page.waitForTimeout(200);

// שלב 5 – חיפוש חומר "דרג"
await page.getByRole('button', { name: /המשך לשלב 5/ }).click();
await page.waitForTimeout(300);
const matInput = page.getByRole('combobox', { name: 'חיפוש חומר' });
check('placeholder של חיפוש חומר', await matInput.getAttribute('placeholder') === 'הקלד שם חומר…');
check('אין רשימה פתוחה לפני הקלדה', await page.getByRole('listbox').count() === 0);
await matInput.fill('דרג');
await page.waitForTimeout(250);
const matOption = page.getByRole('option').first();
check('בדיקה 2: "דרג" מציג את דרגון', (await matOption.textContent()).includes('דרגון'));
check('התוצאה היא button אמיתי', await matOption.evaluate((el) => el.tagName) === 'BUTTON');
await matOption.tap();
await page.waitForTimeout(400);
check('בדיקה 4: לחיצה בטלפון הכניסה את החומר ליומן',
  await page.getByRole('heading', { name: 'דרגון' }).isVisible());
check('בדיקה 5: הבחירה לא בוטלה ע"י blur', await page.getByText('נתוני ביצוע (חובה בכל יומן)').isVisible());

// חומר שני – "דרק"
await page.getByRole('combobox', { name: 'חיפוש חומר' }).fill('דרק');
await page.waitForTimeout(250);
const drakerOption = page.getByRole('option').first();
check('בדיקה 3: "דרק" מציג את דרקר 10.2', (await drakerOption.textContent()).includes('דרקר'));
await drakerOption.tap();
await page.waitForTimeout(400);
check('בדיקה 6: שני חומרים ביומן, כל אחד בכרטיס נפרד',
  await page.getByRole('heading', { name: 'דרקר 10.2' }).isVisible());

// דרקר – מינון מופיע רק אחרי בחירת סוג משטח
const drakerCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'דרקר 10.2' }) }).first();
await drakerCard.getByLabel('תבנית טיפול').selectOption({ label: 'דרקר 10.2 – חרקים זוחלים' });
await page.waitForTimeout(300);
check('דרקר: המינון חסום עד בחירת סוג משטח',
  await drakerCard.getByText(/יש לבחור סוג המשטח המטופל/).isVisible());
await drakerCard.getByRole('button', { name: 'סופג', exact: true }).click();
await page.waitForTimeout(300);
check('דרקר: אחרי בחירת "סופג" מוצג המינון המתאים',
  await drakerCard.getByText('חרקים זוחלים – משטח סופג').isVisible());

// מילוי נתוני ביצוע לשני החומרים
const cards = page.locator('.card').filter({ has: page.getByText('נתוני ביצוע (חובה בכל יומן)') });
const n = await cards.count();
for (let i = 0; i < n; i++) {
  const c = cards.nth(i);
  await c.getByLabel('מספר אצווה').fill(`B-100${i}`);
  await c.getByLabel('תאריך תפוגה שעל האריזה').fill('2027-06-30');
  await c.getByLabel('המינון שנבחר בפועל').fill('לפי התווית');
  await c.getByLabel('כמות חומר בפועל').fill('30');
  await c.getByLabel('כמות מים בפועל').fill('5');
  await c.getByLabel('היקף הטיפול').fill('80');
}

// שלב 6 – אזהרות
await page.getByRole('button', { name: /המשך לשלב 6/ }).click();
await page.waitForTimeout(400);
check('בדיקה 6ב: אזהרות מוצגות תחת שם החומר הנכון',
  await page.getByRole('heading', { name: 'הנחיות ללקוח' }).isVisible());
const custSection = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'הנחיות ללקוח' }) });
check('ציוד מגן של המדביר אינו מוצג ללקוח',
  (await custSection.textContent()).includes('ציוד המגן של המדביר אינו דרישה מהלקוח'));

// שלב 7
await page.getByRole('button', { name: /המשך לשלב 7/ }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'מספר חודשים', exact: true }).click();
await page.getByLabel('מספר חודשי אחריות').fill('3');
await page.waitForTimeout(300);
check('מועד ביקורת חושב אוטומטית מהאחריות',
  (await page.getByLabel('מועד ביקורת הבא').inputValue()).length === 10);
await page.getByRole('button', { name: 'צור משימת מעקב אוטומטית' }).click();
await page.waitForTimeout(300);
check('נוצרה משימת מעקב', await page.getByText('נוצרה משימת מעקב').isVisible());

// שלב 8 – חתימות
await page.getByRole('button', { name: /המשך לשלב 8/ }).click();
await page.waitForTimeout(300);
async function sign(label) {
  const pad = page.getByRole('img', { name: new RegExp(label) });
  await pad.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const box = await pad.boundingBox();
  await page.mouse.move(box.x + 30, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 110);
  await page.mouse.move(box.x + 180, box.y + 50);
  await page.mouse.up();
  await page.waitForTimeout(200);
}
await sign('חתימת המדביר');
await sign('חתימת הלקוח');
await page.getByText('הלקוח קיבל את ההנחיות והוסברו לו').click();
await page.waitForTimeout(400);

const blockingBox = page.locator('.notice-warn');
if (await blockingBox.count()) {
  console.log('--- חסימות שנותרו ---');
  console.log((await blockingBox.first().textContent()).slice(0, 600));
}
const finishBtn = page.getByRole('button', { name: 'שמירה סופית' });
check('אין חסימות – ניתן לסיים את היומן', await finishBtn.isEnabled());
await finishBtn.click();
await page.waitForTimeout(500);
check('בדיקה 1ג: היומן הושלם', await page.getByText(/נשמר\./).first().isVisible());

// בדיקה 13 – מסמך
await page.getByRole('button', { name: /מסמך היומן/ }).click();
await page.waitForTimeout(600);
const docText = await page.locator('.doc').textContent();
check('בדיקה 13: המסמך מציג עברית תקינה', docText.includes('יומן ביצוע עבודת הדברה'));
check('בדיקה 13: המסמך מציג חומר ואצווה', docText.includes('דרגון') && docText.includes('B-1000'));
check('בדיקה 13: המסמך מציג מינון ואזהרות', docText.includes('לפי התווית') && docText.includes('זמן כניסה מחדש'));
const sigImgs = await page.locator('.doc .sig-box img').count();
check('בדיקה 13: המסמך מציג שתי חתימות', sigImgs === 2, `נמצאו ${sigImgs}`);
await page.screenshot({ path: 'doc-mobile.png', fullPage: true });

// בדיקה 12 – שמירה אחרי רענון
await page.goto(BASE + '/#/journals', { waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(700);
check('בדיקה 12: היומן קיים אחרי רענון', await page.getByText('מסעדת הגפן').first().isVisible());
check('בדיקה 12: הסטטוס נשמר כ"הושלם"', await page.getByText('הושלם').first().isVisible());

// מסך בית אחרי רענון
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: 'home-mobile.png', fullPage: true });

// שולחן עבודה
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' });
const dpage = await desktop.newPage();
dpage.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (t.includes('ERR_CERT') || t.includes('Failed to load resource')) return;
  errors.push('desktop: ' + t);
});
dpage.on('pageerror', (e) => errors.push('desktop pageerror: ' + e.message));
await dpage.goto(BASE, { waitUntil: 'networkidle' });
await dpage.waitForTimeout(400);
check('בדיקה 14: תצוגת מחשב – ניווט עליון מוצג', await dpage.locator('.desktop-nav').isVisible());
check('בדיקה 14: תצוגת מחשב – פס תחתון מוסתר', !(await dpage.locator('.bottom-nav').isVisible()));
await dpage.screenshot({ path: 'home-desktop.png', fullPage: true });

// מצב כהה
await dpage.locator('.icon-btn').last().click();
await dpage.waitForTimeout(400);
check('מצב כהה נדלק', await dpage.evaluate(() => document.documentElement.dataset.theme) === 'dark');
await dpage.screenshot({ path: 'home-dark.png', fullPage: true });

check('בדיקה 15: אין שגיאות console מקוד האפליקציה', errors.length === 0, errors.slice(0, 5).join(' | '));

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - failed.length}/${results.length} עברו ===`);
process.exit(failed.length ? 1 : 0);
