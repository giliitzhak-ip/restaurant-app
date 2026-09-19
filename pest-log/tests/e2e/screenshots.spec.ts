import { test } from '@playwright/test';
import { installSupabaseMock } from './fixtures/mockSupabase';
import {
  fillStep1,
  fillStep2Dwelling,
  fillStep3,
  fillStep4,
  fillStep5,
  fillStep6,
  goToStep,
  gotoNewLog,
  login,
} from './helpers';

/**
 * צילומי מסך של הזרימות המרכזיות, לתיעוד.
 * מסומן @screenshots ומורץ בנפרד: `npm run screenshots`.
 */

const DIR = 'docs/screenshots';

test.describe('@screenshots', () => {
  test('צילומי הזרימות המרכזיות', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name === 'mobile-chromium' ? 'mobile' : 'desktop';
    const shot = (name: string) => page.screenshot({ path: `${DIR}/${suffix}-${name}.png`, fullPage: true });

    const server = await installSupabaseMock(page);

    // 1. מסך התחברות
    await page.goto('/');
    await shot('01-login');

    // 2. מסך הבית
    await login(page);
    await shot('02-home');

    // 3–8. ששת שלבי האשף
    await gotoNewLog(page);
    await fillStep1(page);
    await shot('03-step1-parties');

    await fillStep2Dwelling(page);
    await shot('04-step2-location');

    await fillStep3(page);
    await shot('05-step3-monitoring');

    await fillStep4(page);
    await shot('06-step4-treatment');

    await fillStep5(page);
    await shot('07-step5-warnings');

    await fillStep6(page);
    await shot('08-step6-signatures');

    // 9. רשימת שדות חסרים — יומן חדש וריק
    await page.goto('/');
    await page.getByRole('button', { name: '+ יומן הדברה חדש' }).click();
    await goToStep(page, 6);
    await page.getByRole('button', { name: 'השלמת היומן' }).click();
    await page.waitForTimeout(600);
    await shot('09-validation-errors');

    // 10. איוד וערפול — שדות מותנים
    await goToStep(page, 2);
    await page.getByLabel('איוד').check();
    await page.getByLabel('ערפול').check();
    await goToStep(page, 4);
    await page.waitForTimeout(400);
    await shot('10-fumigation-fogging');

    // 11. מסך ההשלמה
    const completed = await page.evaluate(() => window.location.href);
    void completed;
    await page.goto('/');
    await page.getByRole('button', { name: '+ יומן הדברה חדש' }).click();
    await fillStep1(page);
    await fillStep2Dwelling(page);
    await fillStep3(page);
    await fillStep4(page);
    await fillStep5(page);
    await fillStep6(page);
    await page.getByRole('button', { name: 'השלמת היומן' }).click();
    await page.waitForTimeout(1200);
    await shot('11-completed');

    // 12. ארכיון
    await page.goto('/archive');
    await page.waitForTimeout(800);
    await shot('12-archive');

    // 13. ייבוא מהגרסה הקודמת — עם נתוני דוגמה ב-localStorage
    await page.evaluate(() => {
      window.localStorage.setItem(
        'pest_log_legacy_demo',
        JSON.stringify([
          { customer_name: 'מזמין מהגרסה הקודמת', city: 'עיר הדוגמה', street: 'רחוב הדוגמה', date: '2026-05-01' },
          { customer_name: 'מזמין נוסף', city: 'עיר אחרת', unknown_field: 'שדה שלא מופה' },
        ]),
      );
    });
    await page.goto('/import');
    await page.getByRole('button', { name: 'סריקת הנתונים המקומיים' }).click();
    await page.waitForTimeout(800);
    await shot('13-legacy-import');

    // 14. הודעת פרטיות
    await page.goto('/privacy');
    await shot('14-privacy');

    // 15. מצב ללא קליטה
    server.online = false;
    await page.context().setOffline(true);
    await page.goto('/');
    await page.waitForTimeout(800);
    await shot('15-offline');
    await page.context().setOffline(false);
  });
});
