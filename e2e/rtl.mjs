/**
 * בדיקת RTL בתוך מסמך מארח "עירום".
 *
 * כשהאפליקציה מוגשת מתוך index.html שלה, הכיוון מגיע מתוך <html dir="rtl">.
 * אבל כשהבנייה מוטמעת בעמוד אחר (למשל אירוח סטטי או עמוד מארח),
 * ה-<html> אינו שלנו ואין בו dir. הבדיקה מרכיבה בדיוק מצב כזה
 * ומוודאת שהאפליקציה אוכפת RTL בעצמה.
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

// שולף את נתיבי הנכסים הבנויים מתוך index.html
const indexHtml = await (await fetch(`${BASE}/index.html`)).text();
const js = indexHtml.match(/src="([^"]*assets\/[^"]*\.js)"/)?.[1];
const css = indexHtml.match(/href="([^"]*assets\/[^"]*\.css)"/)?.[1];
if (!js || !css) {
  console.error('לא נמצאו נכסים בנויים. יש להריץ build ולהגיש אותו לפני הבדיקה.');
  process.exit(1);
}

const browser = await chromium.launch(LAUNCH);
const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'he-IL' });
await authenticate(ctx, BASE, BIZ);
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

// מסמך מארח ללא dir וללא lang, עם reset דומה לזה של סביבות הטמעה
await page.route('**/__rtl-host', (route) =>
  route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><html><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
      <style>body{margin:0;font:14px system-ui;background:#faf9f7}img{max-width:100%}</style>
      <link rel="stylesheet" href="${css}"></head>
      <body><div id="root"></div><script type="module" src="${js}"></script></body></html>`,
  }),
);

await page.goto(`${BASE}/__rtl-host`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

const info = await page.evaluate(() => {
  const html = document.documentElement;
  const shell = document.querySelector('.app-shell');
  const title = document.querySelector('.topbar h1');
  const tile = document.querySelector('.group-tile');
  const vw = window.innerWidth;
  return {
    htmlDir: html.getAttribute('dir'),
    htmlLang: html.getAttribute('lang'),
    shellDir: shell?.getAttribute('dir') ?? null,
    bodyDirection: getComputedStyle(document.body).direction,
    titleGapRight: title ? Math.round(vw - title.getBoundingClientRect().right) : null,
    titleGapLeft: title ? Math.round(title.getBoundingClientRect().left) : null,
    tileGapRight: tile ? Math.round(vw - tile.getBoundingClientRect().right) : null,
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    hScroll: document.documentElement.scrollWidth > vw + 1,
  };
});

check('האפליקציה קובעת dir="rtl" על המסמך', info.htmlDir === 'rtl', String(info.htmlDir));
check('האפליקציה קובעת lang="he"', info.htmlLang === 'he', String(info.htmlLang));
check('מעטפת האפליקציה מסומנת RTL', info.shellDir === 'rtl', String(info.shellDir));
check('כיוון הטקסט המחושב הוא rtl', info.bodyDirection === 'rtl', info.bodyDirection);
check('הכותרת צמודה לימין ולא לשמאל',
  info.titleGapRight !== null && info.titleGapRight < info.titleGapLeft,
  `ימין=${info.titleGapRight} שמאל=${info.titleGapLeft}`);
check('האריח הראשון בקבוצה מתחיל מימין',
  info.tileGapRight !== null && info.tileGapRight <= 24, String(info.tileGapRight));
check('רקע האפליקציה גובר על רקע המארח',
  info.bodyBackground === 'rgb(244, 247, 245)' || info.bodyBackground === 'rgb(13, 23, 20)',
  info.bodyBackground);
check('אין גלילה אופקית', !info.hScroll);

// גם במסכים פנימיים
await page.goto(`${BASE}/__rtl-host#/materials`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const inner = await page.evaluate(() => {
  const label = document.querySelector('.field label');
  const vw = window.innerWidth;
  const box = label?.getBoundingClientRect();
  // תווית היא בלוק ברוחב מלא, ולכן נמדד מיקום הטקסט עצמו ולא תיבת האלמנט
  let textRight = null;
  let textLeft = null;
  if (label?.firstChild) {
    const range = document.createRange();
    range.selectNodeContents(label);
    const r = range.getBoundingClientRect();
    textRight = Math.round(box.right - r.right);
    textLeft = Math.round(r.left - box.left);
  }
  return {
    dir: document.documentElement.getAttribute('dir'),
    textGapFromRightEdge: textRight,
    textGapFromLeftEdge: textLeft,
    hScroll: document.documentElement.scrollWidth > vw + 1,
  };
});
check('מסך פנימי נשאר RTL', inner.dir === 'rtl', String(inner.dir));
check('טקסט התווית מתחיל בקצה הימני של השדה',
  inner.textGapFromRightEdge !== null && inner.textGapFromRightEdge < inner.textGapFromLeftEdge,
  `מרווח מימין=${inner.textGapFromRightEdge} מרווח משמאל=${inner.textGapFromLeftEdge}`);
check('אין גלילה אופקית במסך פנימי', !inner.hScroll);

check('אין שגיאות דף', errs.length === 0, errs.join(' | '));

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n=== ${results.length - failed}/${results.length} עברו ===`);
process.exit(failed ? 1 : 0);
