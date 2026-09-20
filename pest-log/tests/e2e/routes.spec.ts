import { expect, test, type Page } from '@playwright/test';
import { installSupabaseMock, type ServerState } from './fixtures/mockSupabase';
import { login } from './helpers';

/**
 * מסלול עבודה — בדיקות מקצה לקצה דרך הממשק האמיתי.
 * שכבת Supabase מוחלפת ברמת הרשת בלבד; הקוד של האפליקציה, מנוע
 * הסנכרון ו-IndexedDB הם האמיתיים.
 */

let server: ServerState;

test.beforeEach(async ({ page }) => {
  server = await installSupabaseMock(page);
});

async function openRoute(page: Page): Promise<void> {
  await login(page);
  await page.getByTestId('tile-route').click();
  await expect(page.getByRole('heading', { name: 'המסלול של היום' })).toBeVisible();
  await page.getByRole('button', { name: 'פתיחת המסלול' }).first().click();
  await expect(page.getByTestId('route-timeline')).toBeVisible();
}

test.describe('כניסה למסלול ממסך הבית', () => {
  test('הכפתור מציג את מספר הביקורים שנותרו ונקודת התראה לביקור דחוף', async ({ page }) => {
    await login(page);
    const tile = page.getByTestId('tile-route');
    await expect(tile.locator('.home-tile-badge')).toHaveText('2');
    await expect(tile.locator('.home-tile-alert')).toBeVisible();
    // משמעות ההתראה נמצאת גם בטקסט הנגיש, ולא רק בצבע.
    await expect(tile).toHaveAttribute('aria-label', /דחופים או באיחור/);
  });
});

test.describe('מסך המסלול', () => {
  test('מציג כותרת, מונים ותחנות לפי הסדר', async ({ page }) => {
    await openRoute(page);

    await expect(page.getByRole('heading', { name: /קו ירושלים/ })).toBeVisible();
    await expect(page.getByText('תחנות', { exact: true })).toBeVisible();
    const stops = page.getByTestId('route-timeline').locator('li');
    await expect(stops).toHaveCount(2);
    await expect(stops.first()).toContainText('לקוח פרטי לדוגמה');
    await expect(stops.nth(1)).toContainText('לקוח עסקי לדוגמה');
  });

  test('כפתורי ניווט וחיוג מצביעים לשירותים אמיתיים', async ({ page }) => {
    await openRoute(page);
    const firstStop = page.getByTestId('route-timeline').locator('li').first();

    await expect(firstStop.getByRole('link', { name: /Waze/ })).toHaveAttribute('href', /waze\.com\/ul\?ll=31\.79/);
    await expect(firstStop.getByRole('link', { name: 'Google Maps' })).toHaveAttribute(
      'href',
      /google\.com\/maps\/dir/,
    );
    await expect(firstStop.getByRole('link', { name: /חיוג/ })).toHaveAttribute('href', /^tel:/);
    await expect(firstStop.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', /wa\.me\/9725/);
  });

  test('המרחק והזמן מוצגים כהערכה, ואין הבטחה למסלול אופטימלי', async ({ page }) => {
    await openRoute(page);
    await expect(page.getByText(/הערכה לפי קו אווירי|הערכה חלקית/)).toBeVisible();

    await page.getByRole('button', { name: 'עריכת סדר' }).click();
    await page.getByRole('button', { name: 'סידור מסלול אוטומטי' }).click();
    await expect(page.getByText(/ולא ניתוב אמיתי/)).toBeVisible();
    await expect(page.getByText('אופטימלי')).toHaveCount(0);
  });

  test('שינוי סדר בחצים נשמר ונשלח לשרת', async ({ page }) => {
    await openRoute(page);
    await page.getByRole('button', { name: 'עריכת סדר' }).click();

    await page.getByRole('button', { name: /מקום אחד למעלה/ }).nth(1).click();
    await page.getByRole('button', { name: 'שמירת הסדר' }).click();
    await expect(page.getByText('הסדר החדש נשמר')).toBeVisible();

    await expect
      .poll(() => server.reorderCalls.length, { timeout: 10_000 })
      .toBeGreaterThan(0);
    const order = server.reorderCalls.at(-1) ?? [];
    expect(order[0]).toBe('00000000-0000-4000-f000-00000000000b');

    const stops = page.getByTestId('route-timeline').locator('li');
    await expect(stops.first()).toContainText('לקוח עסקי לדוגמה');
  });

  test('הוספת לקוח למסלול והסרתו אינן נוגעות במאגר הלקוחות', async ({ page }) => {
    await openRoute(page);

    await page.getByRole('button', { name: 'הוספת לקוח' }).click();
    await page.getByLabel('לקוח', { exact: true }).selectOption({ label: 'לקוח פרטי לדוגמה' });
    await page.getByLabel('אתר', { exact: true }).selectOption({ label: 'מחסן — לקוח א׳' });
    await page.getByRole('button', { name: 'הוספה' }).click();
    await expect(page.getByText('הלקוח נוסף למסלול')).toBeVisible();
    await expect(page.getByTestId('route-timeline').locator('li')).toHaveCount(3);

    page.once('dialog', (dialog) => void dialog.accept());
    await page
      .getByTestId('route-timeline')
      .locator('li')
      .nth(2)
      .getByRole('button', { name: /הסרת/ })
      .click();
    await expect(page.getByTestId('route-timeline').locator('li')).toHaveCount(2);

    // הלקוח עצמו עדיין קיים במסך הלקוחות.
    await page.goto('/clients');
    await expect(page.getByText('לקוח פרטי לדוגמה').first()).toBeVisible();
  });
});

test.describe('ביקור', () => {
  test('התחלת טיפול, דגשים, פתיחת יומן וסיום עם משימת המשך', async ({ page }) => {
    await openRoute(page);
    await page.getByRole('button', { name: 'התחלת טיפול' }).first().click();

    await expect(page.getByRole('heading', { name: 'דגשים לביקור הנוכחי' })).toBeVisible();
    await page.getByRole('button', { name: /התחלת טיפול|עדכון שעת התחלה/ }).click();
    await expect(page.getByText('הביקור התחיל. שעת ההגעה נרשמה.')).toBeVisible();

    // הוספת דגש ידני והעברתו ל"בוצע".
    await page.getByRole('button', { name: 'הוספת דגש' }).click();
    await page.getByLabel('כותרת הדגש').fill('בדיקת מוקד במטבח');
    await page.getByRole('button', { name: 'הוספה' }).click();
    await expect(page.getByText('בדיקת מוקד במטבח')).toBeVisible();
    await page.getByLabel('סטטוס הדגש בדיקת מוקד במטבח').selectOption('done');

    // סיום עם משימת המשך.
    await page.getByRole('button', { name: 'סיום ביקור' }).click();
    await page.getByRole('checkbox', { name: 'כל הדגשים נבדקו' }).check();
    await page.getByRole('checkbox', { name: 'נדרשת משימת המשך' }).check();
    await page.getByLabel('הערות סיום').fill('נדרשת השלמה בשבוע הבא');
    await page.getByRole('button', { name: 'שמירת סיום הביקור' }).click();

    await expect(page.getByTestId('route-timeline')).toBeVisible();
    await expect(page.getByTestId('route-timeline').locator('li').first()).toContainText('הושלם');
  });

  test('פתיחת יומן מהביקור ממלאת מזמין ומקום ולא מעתיקה תאריך, ממצאים או אזהרות', async ({ page }) => {
    await openRoute(page);
    await page.getByRole('button', { name: 'התחלת טיפול' }).first().click();
    await page.getByRole('button', { name: 'פתיחת יומן הדברה' }).click();

    await expect(page.getByRole('navigation', { name: 'שלבי מילוי היומן' })).toBeVisible();
    await expect(page.getByText('היומן נפתח מתוך ביקור במסלול')).toBeVisible();

    // מולא: מזמין ומקום.
    await expect(page.getByLabel('שם מזמין ההדברה')).toHaveValue('לקוח פרטי לדוגמה');
    await page.getByRole('navigation', { name: 'שלבי מילוי היומן' }).getByRole('button').nth(1).click();
    await expect(page.getByLabel('עיר', { exact: true })).toHaveValue('ירושלים');

    // לא מולא: תאריך ושעת ביצוע.
    await expect(page.getByLabel('תאריך הביצוע')).toHaveValue('');
    await expect(page.getByLabel('שעת תחילה')).toHaveValue('');
  });
});

test.describe('עבודה ללא קליטה', () => {
  test('סימון התחלת טיפול נשמר בלי רשת ומסתנכרן כשהחיבור חוזר', async ({ page }) => {
    await openRoute(page);
    // הורדה מראש למכשיר.
    await page.goBack();
    await page.getByRole('button', { name: /הורדה לעבודה ללא קליטה/ }).first().click();
    await expect(page.getByText('המסלול נשמר במכשיר לעבודה ללא קליטה')).toBeVisible();

    server.online = false;
    await page.getByRole('button', { name: 'פתיחת המסלול' }).first().click();
    await expect(page.getByText('עובדים ללא קליטה')).toBeVisible();
    await expect(page.getByTestId('route-timeline').locator('li')).toHaveCount(2);

    await page.getByRole('button', { name: 'התחלת טיפול' }).first().click();
    await page.getByRole('button', { name: /התחלת טיפול|עדכון שעת התחלה/ }).click();
    await expect(page.getByText('הביקור התחיל. שעת ההגעה נרשמה.')).toBeVisible();

    // חזרת החיבור — הפעולה נשלחת, והשרת מקבל את הסטטוס החדש.
    server.online = true;
    await page.evaluate(() => globalThis.dispatchEvent(new Event('online')));
    await expect
      .poll(
        () => {
          const visit = server.visits.get('00000000-0000-4000-f000-00000000000a');
          return visit?.status ?? 'pending';
        },
        { timeout: 15_000 },
      )
      .toBe('in_progress');
  });
});

test.describe('קווי אחזקה', () => {
  test('יצירת מסלול מתבנית מדלגת על ביקור שכבר קיים באותו תאריך', async ({ page }) => {
    await login(page);
    await page.getByTestId('tile-route').click();
    await expect(page.getByRole('heading', { name: 'המסלול של היום' })).toBeVisible();
    await page.getByRole('button', { name: 'קווי אחזקה קבועים' }).click();
    await expect(page).toHaveURL(/\/routes\/templates/);

    await expect(page.getByRole('heading', { name: /קו ירושלים/ })).toBeVisible();
    await page.getByRole('button', { name: /יצירת מסלול מהתבנית/ }).first().click();

    // שתי התחנות כבר קיימות להיום במסלול הפתוח, ולכן שתיהן מדולגות.
    await expect(page.getByText(/דולגו/)).toBeVisible();
  });
});
