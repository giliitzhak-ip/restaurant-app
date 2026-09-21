import { chromium } from 'playwright';
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
/** אפשר להצביע על דפדפן מותקן מראש: CHROME_PATH=/path/to/chrome */
const LAUNCH = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};
const browser = await chromium.launch(LAUNCH);
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: 'he-IL' });
const page = await context.newPage();
const problems = [];

await page.goto(BASE, { waitUntil: 'networkidle' });
// יצירת לקוח + יומן כדי להגיע למסכים עתירי שדות
await page.goto(BASE + '/#/customers', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: '+ לקוח חדש' }).click();
await page.getByLabel('שם לקוח / עסק').fill('בדיקת נגישות');
await page.getByLabel('כתובת', { exact: true }).fill('רחוב 1');
await page.getByRole('button', { name: 'שמור', exact: true }).click();
await page.waitForTimeout(400);
await page.locator('.nav-fab').click();
await page.waitForTimeout(400);

async function audit(label) {
  const res = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input, select, textarea')];
    const unlabeled = inputs.filter((el) => {
      const id = el.getAttribute('id');
      const hasLabel = id && document.querySelector(`label[for="${CSS.escape(id)}"]`);
      return !hasLabel && !el.getAttribute('aria-label') && !el.closest('label');
    }).map((el) => el.outerHTML.slice(0, 90));
    const imgs = [...document.querySelectorAll('img')].filter((i) => !i.alt).length;
    const hScroll = document.documentElement.scrollWidth > window.innerWidth + 1;
    return { total: inputs.length, unlabeled, imgsNoAlt: imgs, hScroll };
  });
  console.log(`${label}: שדות=${res.total} ללא תווית=${res.unlabeled.length} תמונות ללא alt=${res.imgsNoAlt} גלילה אופקית=${res.hScroll}`);
  if (res.unlabeled.length) problems.push(`${label}: ${res.unlabeled.join(' | ')}`);
  if (res.hScroll) problems.push(`${label}: גלילה אופקית`);
  // מסכים מבוססי צ'יפים (כפתורים) יכולים להיות ללא שדות קלט – זה תקין
  return res;
}

await audit('אשף שלב 1');
for (const step of [2, 3, 4, 5]) {
  await page.getByRole('button', { name: new RegExp(`המשך לשלב ${step}`) }).click();
  await page.waitForTimeout(350);
  if (step === 5) {
    await page.getByRole('combobox', { name: 'חיפוש חומר' }).fill('דרגון');
    await page.waitForTimeout(300);
    await page.getByRole('option').first().tap();
    await page.waitForTimeout(400);
  }
  await audit(`אשף שלב ${step}`);
}

// 320px
await page.setViewportSize({ width: 320, height: 720 });
await page.waitForTimeout(300);
await audit('שלב 5 ברוחב 320px');

// מסכים נוספים
for (const [route, label] of [['#/tasks', 'משימות'], ['#/route', 'מסלול'], ['#/profile', 'פרופיל'], ['#/materials', 'חומרים']]) {
  await page.goto(BASE + '/' + route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await audit(label);
}

await browser.close();
console.log(problems.length ? '\nבעיות:\n' + problems.join('\n') : '\nללא בעיות נגישות שזוהו.');
process.exit(problems.length ? 1 : 0);
