/**
 * בדיקות קבלה על אמינות השמירה:
 *   א. כשל IndexedDB ו-localStorage אינו מציג "נשמר" – מוצג כשל עם אפשרות לנסות שוב.
 *   ד. ניקוי חתימה נשאר נקי אחרי רענון, והמחיקה מגיעה גם לשרת.
 */

import { chromium, devices } from 'playwright';
import { authenticate } from './helpers.mjs';

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

/** משתיק את הכתיבה לאחסון הקבוע, ושומר דרך לשחזור מתוך הבדיקה. */
const BREAK_STORAGE = () => {
  Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
  const original = Storage.prototype.setItem;
  window.__restoreStorage = () => { Storage.prototype.setItem = original; };
  Storage.prototype.setItem = function blocked() {
    throw new DOMException('QuotaExceededError', 'QuotaExceededError');
  };
};

const savePill = (page) => page.locator(".save-pill").first();

/* ───── א: כשל אחסון אינו מתחזה לשמירה ───── */
{
  const ctx = await browser.newContext(phone);
  await authenticate(ctx, BASE);
  await ctx.addInitScript(BREAK_STORAGE);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => appErrors.push('pageerror: ' + e.message));
  await page.goto(BASE + '/#/customers', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // שינוי אמיתי של נתונים, כדי שהשמירה האוטומטית תרוץ ותיכשל
  await page.getByRole('button', { name: '+ לקוח חדש' }).click();
  await page.getByLabel('שם לקוח / עסק').fill('לקוח בדיקת אחסון');
  await page.getByLabel('כתובת', { exact: true }).fill('הזיתים 4, רמת גן');
  await page.getByRole('button', { name: 'שמור', exact: true }).click();
  await page.waitForTimeout(1200);

  const pillText = (await savePill(page).textContent()) ?? '';
  check('א: כשל אחסון מוצג כ"השמירה נכשלה"', pillText.includes('השמירה נכשלה'), pillText.trim());
  check('א: כשל אחסון אינו מציג "נשמר"', !pillText.includes('נשמר'), pillText.trim());
  check('א: הכשל מוכרז לקורא מסך', (await savePill(page).getAttribute('role')) === 'alert');
  check('א: מוצג כפתור "נסה שוב"', await page.getByRole('button', { name: 'נסה שוב' }).isVisible());
  const title = (await savePill(page).getAttribute('title')) ?? '';
  check('א: הסיבה לכשל מוצגת', /localStorage|IndexedDB/.test(title), title.slice(0, 80));

  // הנתון עצמו לא נעלם מהמסך – הכשל הוא בעמידות, לא באיבוד מיידי
  check('א: הנתון שהוזן נשאר על המסך', await page.getByText('לקוח בדיקת אחסון').first().isVisible());

  // אחרי שהאחסון חוזר לעבוד, "נסה שוב" מצליח
  await page.evaluate(() => window.__restoreStorage?.());
  await page.getByRole('button', { name: 'נסה שוב' }).click();
  await page.waitForTimeout(900);
  const afterRetry = (await savePill(page).textContent()) ?? '';
  check('א: "נסה שוב" מדווח הצלחה אחרי שהאחסון חזר',
    afterRetry.includes('נשמר במכשיר') && !afterRetry.includes('השמירה נכשלה'), afterRetry.trim());

  await ctx.close();
}

/* ───── ד: ניקוי חתימה נשאר נקי אחרי רענון וסנכרון ───── */
{
  const ctx = await browser.newContext(phone);
  const auth = await authenticate(ctx, BASE);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => appErrors.push('pageerror: ' + e.message));

  const serverSignatures = async () => {
    const res = await fetch(`${BASE}/api/entities/signatures?limit=500`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    const body = await res.json();
    return body.items ?? [];
  };

  await page.goto(BASE + '/#/customers', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '+ לקוח חדש' }).click();
  await page.getByLabel('שם לקוח / עסק').fill('לקוח בדיקת חתימה');
  await page.getByLabel('כתובת', { exact: true }).fill('האורן 9, פתח תקווה');
  await page.getByRole('button', { name: 'שמור', exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByText('לקוח בדיקת חתימה').first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'פתח יומן ללקוח' }).click();
  await page.waitForTimeout(600);

  const journalUrl = page.url();
  const journalId = journalUrl.match(/#\/journal\/([^/]+)/)?.[1];
  check('ד: נפתח יומן חדש ללקוח', Boolean(journalId), journalId ?? 'ללא מזהה');
  const stepUrl = `${BASE}/#/journal/${journalId}/8`;

  const goToSignatures = async () => {
    await page.goto(stepUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
  };
  const pad = () => page.locator('canvas[aria-label*="חתימת המדביר"]');
  const padStatus = async () => {
    const field = page.locator('.field', { has: page.locator('canvas[aria-label*="חתימת המדביר"]') });
    return (await field.locator('.small.muted').textContent()) ?? '';
  };

  /** משרטט קו על לוח חתימה, כמו אצבע או עכבר בשטח. */
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
  };

  await goToSignatures();
  check('ד: שלב החתימות נטען', await pad().isVisible());

  // חתימה בעכבר: pointerdown → תנועה → pointerup
  await drawOn(pad());
  await page.waitForTimeout(1200);

  check('ד: החתימה נרשמה', (await padStatus()).includes('נחתם'), await padStatus());
  const afterSign = await serverSignatures();
  const signed = afterSign.find((s) => s.journalId === journalId && s.role === 'exterminator');
  check('ד: החתימה הגיעה לשרת', Boolean(signed));
  check('ד: תמונת החתימה נשלחה במלואה ולא כמציין מקום',
    Boolean(signed?.image?.startsWith('data:image/png;base64,')) && (signed?.image?.length ?? 0) > 500,
    `אורך=${signed?.image?.length ?? 0}`);

  await goToSignatures();
  check('ד: החתימה שרדה רענון', (await padStatus()).includes('נחתם'), await padStatus());

  await page.getByRole('button', { name: 'נקה חתימה' }).first().click();
  await page.waitForTimeout(1200);
  check('ד: אחרי ניקוי מוצג שאין חתימה', !(await padStatus()).includes('נחתם'), await padStatus());

  await goToSignatures();
  check('ד: החתימה נשארה נקייה אחרי רענון', !(await padStatus()).includes('נחתם'), await padStatus());

  const afterClear = await serverSignatures();
  check('ד: המחיקה סונכרנה לשרת',
    !afterClear.some((s) => s.id === signed?.id),
    `רשומות בשרת ליומן: ${afterClear.filter((s) => s.journalId === journalId).length}`);

  const pillText = (await savePill(page).textContent()) ?? '';
  check('ד: אין פעולות שנותרו בתור הסנכרון',
    pillText.includes('סונכרן') && !pillText.includes('ממתינים'), pillText.trim());

  // חתימה מחדש אחרי מחיקה חוזרת ומסונכרנת שוב
  await drawOn(pad());
  await page.waitForTimeout(1200);
  const resigned = (await serverSignatures()).find(
    (s) => s.journalId === journalId && s.role === 'exterminator',
  );
  check('ד: אפשר לחתום מחדש אחרי ניקוי, והחתימה החדשה מסונכרנת', Boolean(resigned?.image),
    `מצב הלוח: ${await padStatus()} · תור: ${(await savePill(page).textContent()) ?? ''}`.trim());

  await ctx.close();
}

check('אין שגיאות דף', appErrors.length === 0, appErrors.join(' | '));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n=== ${passed}/${results.length} עברו ===`);
process.exit(passed === results.length ? 0 : 1);
