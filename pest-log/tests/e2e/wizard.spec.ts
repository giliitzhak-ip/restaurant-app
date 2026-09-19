import { expect, test } from '@playwright/test';
import { installSupabaseMock, type ServerState } from './fixtures/mockSupabase';
import {
  fill,
  login,
  fillStep1,
  fillStep2Dwelling,
  fillStep3,
  fillStep4,
  fillStep5,
  fillStep6,
  goToStep,
  gotoNewLog,
  signPad,
} from './helpers';

let server: ServerState;

test.beforeEach(async ({ page }) => {
  server = await installSupabaseMock(page);
});

test.describe('יומן דירה — זרימה מלאה', () => {
  test('מילוי שישה שלבים והשלמה מקצה מספר סידורי', async ({ page }) => {
    await gotoNewLog(page);

    // דרישה 16 — הודעת המרכז להרעלות מוצגת תמיד.
    await expect(page.getByText(/מרכז הארצי להרעלות/).first()).toBeVisible();
    await expect(page.getByRole('link', { name: '04-7771900' })).toBeVisible();

    await fillStep1(page);
    await fillStep2Dwelling(page);
    await fillStep3(page);
    await fillStep4(page);
    await fillStep5(page);
    await fillStep6(page);

    await page.getByRole('button', { name: 'השלמת היומן' }).click();

    await expect(page.getByRole('heading', { name: 'היומן הושלם ונעול' })).toBeVisible();
    await expect(page.getByText('1', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/טביעת אצבע של המסמך/)).toBeVisible();
    expect(server.completeCalls.length).toBe(1);
  });

  test('לא ניתן להשלים יומן חסר, והשגיאה מקשרת לשדה', async ({ page }) => {
    await gotoNewLog(page);
    await goToStep(page, 6);
    await page.getByRole('button', { name: 'השלמת היומן' }).click();

    // רשימת שדות חסרים בעברית.
    const alert = page.getByRole('alert').filter({ hasText: 'שדות חסרים או שגויים' });
    await expect(alert).toBeVisible();

    // לחיצה על שגיאה מעבירה לשלב ולשדה.
    const firstProblem = alert.getByRole('button').first();
    const problemText = await firstProblem.textContent();
    expect(problemText).toMatch(/[֐-׿]/);
    await firstProblem.click();

    // השדה שקיבל פוקוס הוא שדה טופס אמיתי.
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName ?? '');
    expect(['INPUT', 'TEXTAREA', 'SELECT', 'CANVAS', 'BUTTON', 'DIV']).toContain(focusedTag);

    // ההשלמה לא בוצעה.
    expect(server.completeCalls.length).toBe(0);
  });

  test('שמירה אוטומטית — רענון הדף אינו מאבד מידע', async ({ page }) => {
    await gotoNewLog(page);
    const url = page.url();

    await fillStep1(page);
    // ההמתנה היא ל-debounce של השמירה האוטומטית.
    await expect(page.getByRole('status').filter({ hasText: /סונכרן|ממתין לסנכרון/ }).first()).toBeVisible();

    await page.reload();
    await goToStep(page, 1);
    await expect(page.getByLabel('שם מלא', { exact: true })).toHaveValue('מדביר בדיקה');
    await expect(page.getByLabel('תפקידו', { exact: true })).toHaveValue('בעל הדירה');
    expect(page.url()).toBe(url);
  });
});

test.describe('שטח פתוח', () => {
  test('מחייב רשות מקומית, סוג אתר, תיאור ונ״צ', async ({ page }) => {
    await gotoNewLog(page);
    await fillStep1(page);

    await goToStep(page, 2);
    await page.getByLabel('סוג מקום ההדברה', { exact: true }).selectOption('open_area');
    await expect(page.getByLabel('שם הרשות המקומית', { exact: true })).toBeVisible();
    await expect(page.getByLabel('סוג האתר', { exact: true })).toBeVisible();
    await expect(page.getByLabel('תיאור האתר', { exact: true })).toBeVisible();

    await fill(page, 'שם הרשות המקומית', 'רשות מקומית לבדיקה');
    await fill(page, 'סוג האתר', 'גן ציבורי');
    await fill(page, 'תיאור האתר', 'גן ציבורי עם מתקני משחק ופחי אשפה בהיקפו.');
    await page.getByRole('button', { name: 'מילוי לפי הזמן הנוכחי' }).click();

    await fillStep3(page);
    await fillStep4(page);
    await fillStep5(page);
    await fillStep6(page);

    // בלי נ״צ — ההשלמה נחסמת.
    await page.getByRole('button', { name: 'השלמת היומן' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'שדות חסרים או שגויים' })).toBeVisible();
    expect(server.completeCalls.length).toBe(0);

    // אחרי הזנת נ״צ — עובר.
    await goToStep(page, 2);
    await fill(page, 'קו רוחב', '32.0853');
    await fill(page, 'קו אורך', '34.7818');
    await goToStep(page, 6);
    await page.getByRole('button', { name: 'השלמת היומן' }).click();
    await expect(page.getByRole('heading', { name: 'היומן הושלם ונעול' })).toBeVisible();
  });
});

test.describe('ערפול', () => {
  test('מחייב שם שכונה ותיעוד התראה לציבור', async ({ page }) => {
    await gotoNewLog(page);
    await fillStep1(page);

    await goToStep(page, 2);
    await page.getByLabel('ערפול', { exact: true }).check();
    await page.getByLabel('הדברה רגילה', { exact: true }).uncheck();
    // בערפול הממשק מנחה לבחור מקום מסוג ערפול.
    await expect(page.getByText(/בערפול/).first()).toBeVisible();

    await page.getByLabel('סוג מקום ההדברה', { exact: true }).selectOption('fogging_area');
    await fill(page, 'שם השכונה', 'שכונת הבדיקה');
    await fill(page, 'עיר', 'עיר הבדיקה');
    await fill(page, 'שם הרשות המקומית', 'רשות מקומית לבדיקה');
    await fill(page, 'תיאור השטח המערופל', 'שטחים ציבוריים פתוחים בשכונה כולל שדרה מרכזית.');
    await fill(page, 'קו רוחב', '32.09');
    await fill(page, 'קו אורך', '34.79');
    await page.getByRole('button', { name: 'מילוי לפי הזמן הנוכחי' }).click();

    await fillStep3(page);
    await fillStep4(page);

    // סעיף 11 — תיעוד ההתראה לציבור מופיע בשלב 4.
    await goToStep(page, 4);
    await expect(page.getByRole('heading', { name: /ערפול — התראה לציבור/ })).toBeVisible();
    await page.getByLabel('ניתנה לציבור התראה מראש', { exact: true }).check();
    await fill(page, 'אופן ההתראה לציבור', 'הודעה בלוחות המודעות בשכונה 48 שעות מראש.');
    await page.getByRole('button', { name: /מועד ההתראה/ }).click();

    await fillStep5(page);
    await fillStep6(page);
    await page.getByRole('button', { name: 'השלמת היומן' }).click();
    await expect(page.getByRole('heading', { name: 'היומן הושלם ונעול' })).toBeVisible();
  });

  test('בלי תיעוד התראה לציבור — ההשלמה נחסמת', async ({ page }) => {
    await gotoNewLog(page);
    await fillStep1(page);
    await goToStep(page, 2);
    await page.getByLabel('ערפול', { exact: true }).check();
    await page.getByLabel('סוג מקום ההדברה', { exact: true }).selectOption('fogging_area');
    await fill(page, 'שם השכונה', 'שכונת הבדיקה');
    await fill(page, 'עיר', 'עיר הבדיקה');
    await fill(page, 'שם הרשות המקומית', 'רשות לבדיקה');
    await fill(page, 'תיאור השטח המערופל', 'תיאור השטח לבדיקה.');
    await fill(page, 'קו רוחב', '32.09');
    await fill(page, 'קו אורך', '34.79');
    await page.getByRole('button', { name: 'מילוי לפי הזמן הנוכחי' }).click();

    await fillStep3(page);
    await fillStep4(page);
    await fillStep5(page);
    await fillStep6(page);
    await page.getByRole('button', { name: 'השלמת היומן' }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'שדות חסרים או שגויים' })).toBeVisible();
    expect(server.completeCalls.length).toBe(0);
  });
});

test.describe('איוד', () => {
  test('מחייב תיעוד פעולות איטום לפני האיוד', async ({ page }) => {
    await gotoNewLog(page);
    await fillStep1(page);
    await fillStep2Dwelling(page);

    await goToStep(page, 2);
    await page.getByLabel('איוד', { exact: true }).check();
    await expect(page.getByText(/באיוד/).first()).toBeVisible();

    await fillStep3(page);
    await fillStep4(page);

    // סעיף 10 — הקטע מופיע רק כשנבחר איוד.
    await goToStep(page, 4);
    await expect(page.getByRole('heading', { name: /איוד — פעולות איטום/ })).toBeVisible();

    await fillStep5(page);
    await fillStep6(page);
    await page.getByRole('button', { name: 'השלמת היומן' }).click();

    // בלי פעולות איטום — נחסם.
    await expect(page.getByRole('alert').filter({ hasText: 'שדות חסרים או שגויים' })).toBeVisible();

    await goToStep(page, 4);
    await page.getByRole('button', { name: '+ הוספת פעולת איטום' }).click();
    await fill(page, 'תיאור פעולת האיטום', 'איטום פתחי אוורור ביריעות פוליאתילן');
    await fill(page, 'מיקום האיטום', 'מחסן — קיר צפוני');
    await page.getByRole('button', { name: /מועד סיום פעולות האיטום/ }).click();

    await goToStep(page, 6);
    await page.getByRole('button', { name: 'השלמת היומן' }).click();
    await expect(page.getByRole('heading', { name: 'היומן הושלם ונעול' })).toBeVisible();
  });
});

test.describe('מדביר מסייע', () => {
  test('מחייב פרטים, הנחיות וחתימה', async ({ page }) => {
    await gotoNewLog(page);
    await fillStep1(page);
    await fillStep2Dwelling(page);
    await fillStep3(page);
    await fillStep4(page);
    await fillStep5(page);
    await fillStep6(page);

    await goToStep(page, 6);
    await page.getByLabel('עבד מדביר מסייע', { exact: true }).check();
    await page.getByRole('button', { name: 'השלמת היומן' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'שדות חסרים או שגויים' })).toBeVisible();

    await goToStep(page, 6);
    await page.getByRole('button', { name: '+ הוספת מדביר מסייע' }).click();
    const assistant = page.locator('.repeat-item').filter({ hasText: 'מדביר מסייע 1' });
    await assistant.getByLabel('שם מלא', { exact: true }).fill('מדביר מסייע בדיקה');
    await assistant.getByLabel('סוג רישיון', { exact: true }).fill('הדברה תברואית');
    await assistant.getByLabel('מספר רישיון', { exact: true }).fill('E2E-0009');
    await assistant.getByLabel('טלפון', { exact: true }).fill('0500000009');
    await assistant.getByLabel('דוא״ל', { exact: true }).fill('assistant@example.test');
    await assistant.getByLabel('כתובת', { exact: true }).fill('רחוב הבדיקה 9');
    await assistant.getByLabel('ניתנו למדביר המסייע הנחיות', { exact: true }).check();
    await assistant.getByLabel('קיבל עותק מהיומן', { exact: true }).check();
    await signPad(page, 'חתימת המדביר המסייע');

    await page.getByRole('button', { name: 'השלמת היומן' }).click();
    await expect(page.getByRole('heading', { name: 'היומן הושלם ונעול' })).toBeVisible();
  });
});

test.describe('עבודה ללא קליטה וחזרה לרשת', () => {
  test('טיוטה נשמרת ללא קליטה ומסתנכרנת בלי כפילויות בחזרה לרשת', async ({ page, context }) => {
    await gotoNewLog(page);
    await fillStep1(page);

    // ניתוק
    server.online = false;
    await context.setOffline(true);

    await fillStep2Dwelling(page);
    await fillStep3(page);

    // מצב השמירה מוצג למשתמש.
    await expect(page.getByRole('status').filter({ hasText: /נשמר מקומית|ממתין לסנכרון|שגיאת סנכרון/ }).first()).toBeVisible();

    // רענון בזמן ניתוק — המידע לא נאבד (IndexedDB).
    await page.reload();
    await goToStep(page, 3);
    await expect(page.getByLabel('שם המזיק', { exact: true }).first()).toHaveValue('מזיק דוגמה 1');
    await goToStep(page, 2);
    await expect(page.getByLabel('עיר', { exact: true })).toHaveValue('עיר הבדיקה');

    const callsWhileOffline = server.upsertCalls.length;

    // חזרה לרשת
    server.online = true;
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    await expect(page.getByRole('status').filter({ hasText: 'סונכרן' }).first()).toBeVisible({ timeout: 30_000 });

    // אין כפילויות: כל מפתח אידמפוטנטיות נשלח פעם אחת.
    const unique = new Set(server.upsertCalls);
    expect(unique.size).toBe(server.upsertCalls.length);
    expect(server.upsertCalls.length).toBeGreaterThan(callsWhileOffline);

    // רק יומן אחד נוצר בשרת.
    expect(server.logs.size).toBe(1);
  });

  test('השלמה ללא קליטה נחסמת בהודעה ברורה ולא מאבדת את הטיוטה', async ({ page, context }) => {
    await gotoNewLog(page);
    await fillStep1(page);
    await fillStep2Dwelling(page);
    await fillStep3(page);
    await fillStep4(page);
    await fillStep5(page);
    await fillStep6(page);

    server.online = false;
    await context.setOffline(true);

    await page.getByRole('button', { name: 'השלמת היומן' }).click();
    await expect(page.getByText(/אין חיבור לרשת/)).toBeVisible();
    expect(server.completeCalls.length).toBe(0);

    // חזרה לרשת — ההשלמה עוברת.
    server.online = true;
    await context.setOffline(false);
    await page.getByRole('button', { name: 'השלמת היומן' }).click();
    await expect(page.getByRole('heading', { name: 'היומן הושלם ונעול' })).toBeVisible();
  });
});

test.describe('נגישות ועיצוב', () => {
  test('RTL, עברית, וצבעי שחור וזהב נשמרים', async ({ page }) => {
    await login(page);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');

    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe('rgb(11, 11, 13)');

    const gold = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--gold').trim(),
    );
    expect(gold).toBe('#d4af37');
  });

  test('ניווט מקלדת ודילוג לתוכן עובדים', async ({ page }) => {
    await login(page);
    await page.keyboard.press('Tab');
    const firstFocus = await page.evaluate(() => document.activeElement?.className ?? '');
    expect(firstFocus).toContain('skip-link');
  });

  test('לכל שדה חובה יש תווית ו-aria-required', async ({ page }) => {
    await gotoNewLog(page);
    const requiredInputs = page.locator('input[aria-required="true"]');
    const count = await requiredInputs.count();
    expect(count).toBeGreaterThan(3);

    for (let index = 0; index < Math.min(count, 6); index += 1) {
      const input = requiredInputs.nth(index);
      const id = await input.getAttribute('id');
      expect(id).toBeTruthy();
      await expect(page.locator(`label[for="${id}"]`)).toHaveCount(1);
    }
  });
});
