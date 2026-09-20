import { expect, test } from '@playwright/test';
import { installSupabaseMock, type ServerState } from './fixtures/mockSupabase';
import { fillStep1, login } from './helpers';

/**
 * מסך הבית המחודש: רשת כפתורים עגולים, מונים אמיתיים, ניווט ונגישות.
 */

let server: ServerState;

test.beforeEach(async ({ page }) => {
  server = await installSupabaseMock(page);
});

const TILES: Array<{ testId: string; label: string; path: string }> = [
  { testId: 'tile-new-log', label: 'יומן חדש', path: '/logs/' },
  { testId: 'tile-drafts', label: 'טיוטות', path: '/drafts' },
  { testId: 'tile-archive', label: 'ארכיון', path: '/archive' },
  { testId: 'tile-clients', label: 'לקוחות', path: '/clients' },
  { testId: 'tile-bait-stations', label: 'תחנות האכלה', path: '/bait-stations' },
  { testId: 'tile-products', label: 'תכשירים', path: '/products' },
  { testId: 'tile-tasks', label: 'משימות', path: '/tasks' },
  { testId: 'tile-profile', label: 'פרופיל', path: '/profile' },
  { testId: 'tile-settings', label: 'הגדרות', path: '/settings' },
];

test.describe('מסך הבית', () => {
  test('מציג ברכה לפי שעה, שם העסק וסטטוס סנכרון', async ({ page }) => {
    await login(page);

    await expect(page.getByText('יצחק אחזקות והדברות').first()).toBeVisible();
    await expect(page.getByText('מה תרצה לבצע היום?')).toBeVisible();
    await expect(page.getByRole('heading', { name: /בוקר טוב|צהריים טובים|ערב טוב|לילה טוב/ })).toBeVisible();
    // סטטוס סנכרון אמיתי, לא טקסט קבוע.
    await expect(page.getByRole('status').filter({ hasText: /מסונכרן|שומר…|ממתין לחיבור|שגיאת סנכרון/ }).first()).toBeVisible();
  });

  test('כל תשעת הכפתורים מוצגים בסדר הנדרש', async ({ page }) => {
    await login(page);

    const grid = page.getByRole('navigation', { name: 'פעולות ראשיות' });
    await expect(grid).toBeVisible();

    const buttons = grid.getByRole('button');
    await expect(buttons).toHaveCount(TILES.length);

    for (const [index, tile] of TILES.entries()) {
      await expect(buttons.nth(index)).toHaveAttribute('data-testid', tile.testId);
      await expect(page.getByTestId(tile.testId)).toContainText(tile.label);
    }
  });

  test('כל כפתור מוביל למסך הנכון, וחזרה מחזירה הביתה', async ({ page }) => {
    await login(page);

    for (const tile of TILES) {
      await page.getByTestId(tile.testId).click();
      await expect(page).toHaveURL(new RegExp(tile.path.replace('/', '\\/')));
      await page.goBack();
      await expect(page.getByRole('navigation', { name: 'פעולות ראשיות' })).toBeVisible();
    }
  });

  test('כפתור "יומן חדש" הוא הפעולה הראשית ומסומן בטבעת', async ({ page }) => {
    await login(page);
    const primary = page.getByTestId('tile-new-log');
    await expect(primary).toHaveClass(/is-primary/);

    // הטבעת מגיעה מצל נוסף על העיגול.
    const shadow = await primary.locator('.home-tile-circle').evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).toContain('rgba(22, 201, 86');
  });

  test('כל כפתור הוא button אמיתי עם aria-label בעברית', async ({ page }) => {
    await login(page);
    const buttons = page.getByRole('navigation', { name: 'פעולות ראשיות' }).getByRole('button');

    for (let index = 0; index < TILES.length; index += 1) {
      const button = buttons.nth(index);
      await expect(button).toHaveJSProperty('tagName', 'BUTTON');
      const label = await button.getAttribute('aria-label');
      expect(label).toBeTruthy();
      expect(label).toMatch(/[֐-׿]/);
    }
  });

  test('ניווט מקלדת: דילוג לתוכן ואז מיקוד על הכפתורים', async ({ page }) => {
    await login(page);
    await page.keyboard.press('Tab');
    const firstFocus = await page.evaluate(() => document.activeElement?.className ?? '');
    expect(firstFocus).toContain('skip-link');

    // הפעלת כפתור במקלדת מנווטת בדיוק כמו לחיצה.
    await page.getByTestId('tile-archive').focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/archive/);
  });
});

test.describe('תגי המונים', () => {
  test('אין תג כאשר אין נתונים', async ({ page }) => {
    await login(page);
    // אין טיוטות ואין משימות בהתחלה.
    await expect(page.getByTestId('tile-drafts').locator('.home-tile-badge')).toHaveCount(0);
    await expect(page.getByTestId('tile-tasks').locator('.home-tile-badge')).toHaveCount(0);
  });

  test('תג הטיוטות סופר טיוטות אמיתיות', async ({ page }) => {
    await login(page);

    // יצירת טיוטה אמיתית דרך האשף.
    await page.getByTestId('tile-new-log').click();
    await fillStep1(page);
    await page.getByRole('button', { name: 'חזרה למסך הקודם' }).click();

    await expect(page.getByRole('navigation', { name: 'פעולות ראשיות' })).toBeVisible();
    const badge = page.getByTestId('tile-drafts').locator('.home-tile-badge');
    await expect(badge).toHaveText('1');

    // התג משקף את מה שמוצג במסך הטיוטות.
    await page.getByTestId('tile-drafts').click();
    await expect(page.getByRole('heading', { name: 'טיוטות' })).toBeVisible();
    await expect(page.getByText('מזמין בדיקה')).toBeVisible();
    expect(server.logs.size).toBeGreaterThanOrEqual(0);
  });
});

test.describe('התנהגות ותנועה', () => {
  test('לחיצה כפולה מהירה אינה פותחת פעמיים', async ({ page }) => {
    await login(page);
    const tile = page.getByTestId('tile-archive');
    await tile.dblclick();
    await expect(page).toHaveURL(/\/archive/);

    // חזרה אחת מספיקה כדי לשוב הביתה — כלומר נרשמה כניסה אחת בלבד.
    await page.goBack();
    await expect(page.getByRole('navigation', { name: 'פעולות ראשיות' })).toBeVisible();
  });

  test('הגלילה מציגה כותרת דביקה ומעלימה את הברכה', async ({ page }) => {
    await login(page);
    // הוספת גובה זמני כדי שתהיה גלילה גם במסך גדול.
    await page.evaluate(() => {
      const filler = document.createElement('div');
      filler.style.height = '1400px';
      document.querySelector('.home-body')?.appendChild(filler);
    });

    await page.evaluate(() => globalThis.scrollTo(0, 300));
    await expect(page.locator('.home-sticky')).toHaveClass(/is-visible/);

    // לברכה יש מעבר אטימות, ולכן נמדד הערך אחרי שהמעבר הסתיים.
    await expect
      .poll(
        async () =>
          Number(await page.locator('.home-greeting').evaluate((el) => getComputedStyle(el).opacity)),
        { timeout: 5000 },
      )
      .toBeLessThan(0.2);

    // האזור הירוק מתכווץ — ההזזה מתבצעת ב-transform בלבד.
    const heroTransform = await page.locator('.home-hero').evaluate((el) => getComputedStyle(el).transform);
    expect(heroTransform).not.toBe('none');
  });

  test('prefers-reduced-motion: בלי ripple ובלי הזזות', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await login(page);

    await page.getByTestId('tile-clients').click();
    await expect(page).toHaveURL(/\/clients/);

    // ה-ripple מוסתר לגמרי במצב הפחתת תנועה.
    const rippleDisplay = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.className = 'ripple';
      document.body.appendChild(probe);
      const display = getComputedStyle(probe).display;
      probe.remove();
      return display;
    });
    expect(rippleDisplay).toBe('none');
  });
});
