import { expect, test } from '@playwright/test';
import { installSupabaseMock, type ServerState } from './fixtures/mockSupabase';
import { fillStep1, fillStep2Dwelling, goToStep, gotoNewLog, login } from './helpers';

/**
 * הפונקציות שהועברו מהגרסה המקומית הקודמת של היומן:
 * ספריות ניסוח, מאגר תחנות לאתר, הדבקת נ״צ, אחריות ובדיקת מערכת.
 */

let server: ServerState;

test.beforeEach(async ({ page }) => {
  server = await installSupabaseMock(page);
});

test.describe('ספריות ניסוח', () => {
  test('הוספת ניסוח מהספרייה לשדה סימני הנגיעות, ושמירת הטקסט כתבנית', async ({ page }) => {
    await gotoNewLog(page);
    await goToStep(page, 3);
    await page.getByRole('button', { name: '+ הוספת מזיק' }).click();

    const signs = page.getByLabel('סימני נגיעות', { exact: true });
    await signs.fill('');

    await page.getByRole('button', { name: /^הוסף מתבנית$/ }).first().click();
    const dialog = page.getByRole('dialog', { name: 'ממצאי ניטור' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('שיירות נמלים.')).toBeVisible();

    await dialog.getByText('שיירות נמלים.').locator('..').getByRole('button').first().click();
    await dialog.getByRole('button', { name: /הוספת הנבחרים/ }).click();

    await expect(signs).toHaveValue(/שיירות נמלים/);

    // ניסוח של המדביר עצמו נשמר כתבנית; ניסוח מובנה לא נשמר שוב.
    await signs.fill('נמצאו שיירות נמלים לאורך אדן החלון המערבי');
    await page.getByRole('button', { name: /שמירת הטקסט כתבנית/ }).first().click();
    await expect
      .poll(() => server.textTemplates.size, { timeout: 10_000 })
      .toBeGreaterThan(0);
  });

  test('הספרייה אומרת במפורש שהניסוחים אינם מחליפים את תווית התכשיר', async ({ page }) => {
    await gotoNewLog(page);
    await goToStep(page, 3);
    await page.getByRole('button', { name: '+ הוספת מזיק' }).click();
    await page.getByRole('button', { name: /^הוסף מתבנית$/ }).first().click();
    await expect(page.getByText(/אזהרות ייחודיות לתכשיר וזמן כניסה מחדש נקבעים לפי התווית/)).toBeVisible();
  });
});

test.describe('הדבקת נ״צ', () => {
  test('נ״צ שהודבק מקישור מפות נכנס לשדות הקואורדינטות', async ({ page }) => {
    await gotoNewLog(page);
    await goToStep(page, 2);

    await page.getByLabel('הדבקת נ״צ או קישור ממפות').fill('https://waze.com/ul?ll=31.771959,35.217018');
    await page.getByRole('button', { name: 'הוספת הנ״צ שהודבק' }).click();

    await expect(page.getByText(/נקלטה נקודת ציון שהודבקה/)).toBeVisible();
    await expect(page.getByLabel('קו רוחב')).toHaveValue('31.771959');
    await expect(page.getByLabel('קו אורך')).toHaveValue('35.217018');
  });

  test('טקסט שאינו נ״צ מקבל הסבר ולא נכנס לשדות', async ({ page }) => {
    await gotoNewLog(page);
    await goToStep(page, 2);

    await page.getByLabel('הדבקת נ״צ או קישור ממפות').fill('רחוב הדוגמה 12');
    await page.getByRole('button', { name: 'הוספת הנ״צ שהודבק' }).click();
    await expect(page.getByText(/לא זוהתה נקודת ציון/)).toBeVisible();
  });
});

test.describe('מאגר תחנות לאתר', () => {
  test('הגדרת תחנות פעם אחת לאתר, וסימון מצבן בביקור', async ({ page }) => {
    await gotoNewLog(page);
    await fillStep1(page);
    await fillStep2Dwelling(page);
    await goToStep(page, 4);

    const section = page.getByRole('region', { name: 'תחנות האכלה וניטור באתר' });
    await expect(section).toBeVisible();

    await section.getByLabel('סוג התחנה').selectOption('bait_poison');
    await section.getByLabel('מיקום', { exact: true }).fill('מחסן צפוני');
    await section.getByLabel('כמה תחנות').fill('3');
    await section.getByRole('button', { name: /הוספה למאגר האתר/ }).click();

    await expect(page.getByText('3 תחנות נוספו לאתר')).toBeVisible();
    await expect
      .poll(() => server.siteStations.size, { timeout: 10_000 })
      .toBe(3);

    // סימון כל התחנות כשלמות — כמו בגרסה הקודמת.
    await section.getByRole('button', { name: 'סימון הכל כשלמות' }).click();
    await expect(page.getByText(/כל התחנות תועדו/)).toBeVisible();
  });
});

test.describe('אחריות ובדיקת מערכת', () => {
  test('סעיף האחריות נשמר ביומן ומסומן כלא מחייב', async ({ page }) => {
    await gotoNewLog(page);
    await goToStep(page, 5);

    await expect(page.getByText('אינה חלק מהדרישות המחייבות ביומן')).toBeVisible();
    await page.getByLabel('תקופת האחריות').selectOption('3 חודשים');
    await page.getByLabel('תנאי האחריות והערות').fill('האחריות בכפוף לביצוע פעולות המניעה.');

    await expect(page.getByLabel('תקופת האחריות')).toHaveValue('3 חודשים');
  });

  test('בדיקת מערכת מריצה בדיקות אמיתיות', async ({ page }) => {
    await login(page);
    await page.goto('/diagnostics');

    await expect(page.getByRole('heading', { name: 'בדיקת מערכת' })).toBeVisible();
    await expect(page.getByText('אחסון מקומי (IndexedDB)')).toBeVisible();
    await expect(page.getByText('תור הסנכרון')).toBeVisible();
    await expect(page.getByText(/המסד המקומי פתוח/)).toBeVisible();
  });
});

test.describe('סיווג תמונות', () => {
  test('ניתן לבחור סיווג לתמונות הבאות', async ({ page }) => {
    await gotoNewLog(page);
    await goToStep(page, 3);

    const selector = page.getByLabel('סיווג התמונות הבאות');
    await expect(selector).toBeVisible();
    await selector.selectOption('hazard');
    await expect(selector).toHaveValue('hazard');
  });
});
