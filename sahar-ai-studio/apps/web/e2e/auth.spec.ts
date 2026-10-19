import { expect, test } from '@playwright/test';
import { logout, PASSWORD, register, uniqueEmail } from './helpers';

test.describe('authentication', () => {
  test('anonymous visitors are sent to a Hebrew RTL login page', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/login\?next=%2Fsettings$/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
    await expect(page.getByRole('heading', { name: 'התחברות לסטודיו' })).toBeVisible();
  });

  test('register → dashboard → logout → login, with a secure session cookie', async ({
    page,
    context,
  }) => {
    const email = uniqueEmail('flow');
    await register(page, { name: 'שרונה סהר', email });

    await expect(page.getByRole('heading', { name: 'שלום, שרונה סהר' })).toBeVisible();
    await expect(page.getByTestId('stat-projects')).toHaveText('0');
    await expect(page.getByTestId('health-database').getByText('פעיל')).toBeVisible();
    await expect(page.getByTestId('health-redis').getByText('פעיל')).toBeVisible();

    const cookie = (await context.cookies()).find((c) => c.name === 'sahar_session');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
    expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);

    await logout(page);
    expect((await context.cookies()).find((c) => c.name === 'sahar_session')).toBeUndefined();

    // Old cookie value must be useless after logout (session revoked server-side).
    await context.addCookies([{ ...cookie!, expires: -1 }]);
    await page.goto('/');
    await expect(page).toHaveURL('/login');

    await page.getByLabel('אימייל').fill(email.toUpperCase());
    await page.getByLabel('סיסמה').fill(PASSWORD);
    await page.getByRole('button', { name: 'התחברות' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('current-user-name').first()).toHaveText('שרונה סהר');
  });

  test('wrong password shows a generic error', async ({ page }) => {
    const email = uniqueEmail('wrong');
    await register(page, { name: 'Test', email });
    await logout(page);

    await page.getByLabel('אימייל').fill(email);
    await page.getByLabel('סיסמה').fill('not-the-password');
    await page.getByRole('button', { name: 'התחברות' }).click();
    await expect(page.getByTestId('form-error')).toHaveText('האימייל או הסיסמה שגויים.');
    await expect(page).toHaveURL('/login');
  });

  test('registration validates input and refuses duplicate emails', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('שם מלא').fill('בדיקה');
    await page.getByLabel('אימייל').fill('bad-email');
    await page.getByLabel('סיסמה', { exact: true }).fill('short');
    await page.getByLabel('אימות סיסמה').fill('different');
    await page.getByRole('button', { name: 'יצירת חשבון' }).click();
    await expect(page.getByText('כתובת אימייל לא תקינה.')).toBeVisible();
    await expect(page.getByText('הסיסמה חייבת להכיל 10–200 תווים.')).toBeVisible();
    await expect(page.getByText('יש לאשר את תנאי השימוש בזכויות מדיה.')).toBeVisible();

    const email = uniqueEmail('dup');
    await register(page, { name: 'ראשון', email });
    await logout(page);
    await page.goto('/register');
    await page.getByLabel('שם מלא').fill('שני');
    await page.getByLabel('אימייל').fill(email);
    await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
    await page.getByLabel('אימות סיסמה').fill(PASSWORD);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'יצירת חשבון' }).click();
    await expect(page.getByText('כתובת האימייל כבר רשומה. נסו להתחבר.')).toBeVisible();
  });

  test('open redirects via ?next= are ignored', async ({ page }) => {
    const email = uniqueEmail('redirect');
    await register(page, { name: 'Redirect', email });
    await logout(page);
    await page.goto('/login?next=//evil.example/steal');
    await page.getByLabel('אימייל').fill(email);
    await page.getByLabel('סיסמה').fill(PASSWORD);
    await page.getByRole('button', { name: 'התחברות' }).click();
    await expect(page).toHaveURL('/');
  });

  test('repeated failed logins for one account are rate limited', async ({ page }) => {
    const email = uniqueEmail('brute');
    await register(page, { name: 'Brute', email });
    await logout(page);

    // Each attempt waits for its server action round-trip so submissions never overlap.
    const attempt = async (password: string) => {
      await page.getByLabel('אימייל').fill(email);
      await page.getByLabel('סיסמה').fill(password);
      await Promise.all([
        page.waitForResponse(
          (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/login',
        ),
        page.getByRole('button', { name: 'התחברות' }).click(),
      ]);
    };

    for (let i = 1; i <= 8; i++) {
      await attempt(`wrong-${i}`);
      await expect(page.getByTestId('form-error')).toHaveText('האימייל או הסיסמה שגויים.');
    }

    // Even the correct password is refused once the limit is hit.
    await attempt(PASSWORD);
    await expect(page.getByTestId('form-error')).toHaveText(
      /^יותר מדי ניסיונות\. נסו שוב בעוד \d+ דקות\.$/,
    );
    await expect(page).toHaveURL('/login');
  });
});
