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

    // 2. מסך הבית — הרשת המלאה
    await login(page);
    await page.waitForTimeout(700);
    await shot('02-home');

    // 2א. מסך הבית אחרי גלילה — כותרת דביקה.
    // במסך גדול כל הרשת נכנסת ואין גלילה כלל, ולכן הצילום מתבצע בגודל
    // מסך קטן (iPhone SE) שבו התוכן באמת עולה על גובה החלון.
    // צילום חלון ולא fullPage: צילום עמוד מלא מאפס את הגלילה.
    const originalViewport = page.viewportSize();
    await page.setViewportSize({ width: 375, height: 667 });
    await page.evaluate(() => globalThis.scrollTo(0, 260));
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${DIR}/${suffix}-02a-home-scrolled.png`, fullPage: false });
    if (originalViewport) await page.setViewportSize(originalViewport);
    await page.evaluate(() => globalThis.scrollTo(0, 0));
    await page.waitForTimeout(400);

    // 3–8. ששת שלבי האשף
    await gotoNewLog(page);
    await fillStep1(page);
    await shot('03-step1-parties');

    await fillStep2Dwelling(page);
    await shot('04-step2-location');

    await fillStep3(page);
    await shot('05-step3-monitoring');

    // ספריית הניסוחים שהועברה מהגרסה הקודמת
    await page.getByRole('button', { name: /^הוסף מתבנית$/ }).first().click();
    await page.waitForTimeout(400);
    await shot('05a-template-library');
    await page.getByRole('dialog').getByRole('button', { name: 'סגירה' }).click();

    await fillStep4(page);
    await shot('06-step4-treatment');

    // מאגר תחנות האכלה וניטור לאתר
    const stations = page.getByRole('region', { name: 'תחנות האכלה וניטור באתר' });
    if (await stations.isVisible().catch(() => false)) {
      await stations.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await shot('06a-site-stations');
    }

    await fillStep5(page);
    await shot('07-step5-warnings');

    await fillStep6(page);
    await shot('08-step6-signatures');

    // 9. רשימת שדות חסרים — יומן חדש וריק
    await page.goto('/');
    await page.getByTestId('tile-new-log').click();
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
    await page.getByTestId('tile-new-log').click();
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

    // 12א. המסכים החדשים שמסך הבית מוביל אליהם
    for (const [name, path] of [
      ['12a-drafts', '/drafts'],
      ['12b-tasks', '/tasks'],
      ['12c-products', '/products'],
      ['12d-bait-stations', '/bait-stations'],
      ['12e-profile', '/profile'],
      ['12f-settings', '/settings'],
    ] as const) {
      await page.goto(path);
      await page.waitForTimeout(600);
      await shot(name);
    }

    // 12ז. מסלול עבודה — רשימה, מסלול היום, ביקור ודגשים, מפה ודוח
    await page.goto('/routes');
    await page.waitForTimeout(700);
    await shot('12g-routes');

    await page.getByRole('button', { name: 'פתיחת המסלול' }).first().click();
    await page.waitForTimeout(700);
    await shot('12h-route-day');

    await page.getByRole('button', { name: 'עריכת סדר' }).click();
    await page.getByRole('button', { name: 'סידור מסלול אוטומטי' }).click();
    await page.waitForTimeout(500);
    await shot('12i-route-reorder');
    await page.getByRole('button', { name: 'ביטול' }).click();

    await page.getByRole('button', { name: 'התחלת טיפול' }).first().click();
    await page.waitForTimeout(800);
    await shot('12j-visit');

    await page.getByRole('button', { name: 'הוספת דגש' }).click();
    await page.getByLabel('כותרת הדגש').fill('בדיקת מוקד במחסן');
    await page.getByRole('button', { name: 'הוספה' }).click();
    await page.waitForTimeout(500);
    await shot('12k-visit-focus');

    await page.goBack();
    await page.waitForTimeout(400);
    const routeUrl = page.url();
    await page.goto(`${routeUrl}/map`);
    await page.waitForTimeout(700);
    await shot('12l-route-map');
    await page.goto(`${routeUrl}/report`);
    await page.waitForTimeout(700);
    await shot('12m-route-report');
    await page.goto('/routes/templates');
    await page.waitForTimeout(700);
    await shot('12n-route-templates');

    // 12ס. הפונקציות שהועברו מהגרסה הקודמת
    await page.goto('/diagnostics');
    await page.waitForTimeout(900);
    await shot('12o-diagnostics');

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
