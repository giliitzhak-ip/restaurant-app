import { expect, test } from '@playwright/test';
import { register, uniqueEmail } from './helpers';

const PAGES = [
  { link: 'לוח בקרה', heading: /^שלום, / },
  { link: 'קליפ חדש', heading: 'קליפ מוזיקלי חדש' },
  { link: 'ספריית דמויות', heading: 'ספריית דמויות' },
  { link: 'סטודיו שירה AI', heading: 'סטודיו שירה AI' },
  { link: 'עורך סצנות', heading: 'עורך סצנות', phase: 'יתווסף בשלב 5' },
  { link: 'עורך ציר זמן', heading: 'עורך ציר זמן', phase: 'יתווסף בשלב 5' },
  { link: 'ספריית פרויקטים', heading: 'ספריית פרויקטים' },
  { link: 'תור רינדור', heading: 'תור רינדור', phase: 'יתווסף בשלב 5' },
  { link: 'הגדרות וספקי AI', heading: 'הגדרות וספקי AI' },
] as const;

test.describe('application shell', () => {
  test.beforeEach(async ({ page }) => {
    await register(page, { name: 'נווטת', email: uniqueEmail('nav') });
  });

  test('every page is reachable from the sidebar, with honest phase notices', async ({ page }) => {
    const nav = page.getByTestId('desktop-nav');
    for (const entry of PAGES) {
      await nav.getByRole('link', { name: entry.link }).click();
      await expect(page.getByRole('heading', { level: 1, name: entry.heading })).toBeVisible();
      await expect(nav.getByRole('link', { name: entry.link })).toHaveAttribute(
        'aria-current',
        'page',
      );
      if ('phase' in entry) {
        const notice = page.getByTestId('phase-notice');
        await expect(notice.getByText(entry.phase)).toBeVisible();
        // Unimplemented modules must not present working-looking buttons.
        await expect(notice.getByRole('button')).toHaveCount(0);
      }
    }
  });

  test('sidebar sits on the right in Hebrew and on the left in English', async ({ page }) => {
    const sidebarBox = async () => (await page.locator('aside').boundingBox())!;
    const viewport = page.viewportSize()!;
    expect((await sidebarBox()).x).toBeGreaterThan(viewport.width / 2);

    await page.goto('/settings');
    await page.getByTestId('language-en').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Settings & API Providers' }),
    ).toBeVisible();
    expect((await sidebarBox()).x).toBeLessThan(viewport.width / 2);

    // Preference is stored on the account: it survives a new browser session.
    await page.context().clearCookies();
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    await page.getByTestId('language-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { name: 'Sign in to the studio' })).toBeVisible();
  });

  test('provider keys are reported only as configured / not configured', async ({ page }) => {
    await page.goto('/settings');
    const providers = page.getByTestId('provider-status');
    await expect(providers.getByText('Hedra', { exact: true })).toBeVisible();
    await expect(providers.getByText('HEDRA_API_KEY')).toBeVisible();
    await expect(providers.getByText('fal.ai Lip Sync')).toBeVisible();
    await expect(providers.getByText('מתוכנן לשלב 7')).toBeVisible();
    // No key material is ever rendered.
    const html = await page.content();
    for (const secret of [
      process.env.HEDRA_API_KEY,
      process.env.FAL_KEY,
      process.env.AUTH_SECRET,
    ]) {
      if (secret) expect(html).not.toContain(secret);
    }
  });

  test('monthly budget can be set, validated and cleared', async ({ page }) => {
    await page.goto('/settings');
    const form = page.getByTestId('budget-form');
    const input = form.getByLabel('תקציב חודשי בדולרים (USD)');

    await input.fill('abc');
    await form.getByRole('button', { name: 'שמירה' }).click();
    await expect(form.getByTestId('form-error')).toHaveText('נא להזין סכום בין 0 ל-100,000.');

    await input.fill('49.90');
    await form.getByRole('button', { name: 'שמירה' }).click();
    await expect(form.getByRole('status')).toHaveText('התקציב עודכן.');
    await page.reload();
    await expect(
      page.getByTestId('budget-form').getByLabel('תקציב חודשי בדולרים (USD)'),
    ).toHaveValue('49.90');

    await page.getByTestId('budget-form').getByLabel('תקציב חודשי בדולרים (USD)').fill('');
    await page.getByTestId('budget-form').getByRole('button', { name: 'שמירה' }).click();
    await expect(page.getByTestId('budget-form').getByRole('status')).toBeVisible();
    await page.reload();
    await expect(
      page.getByTestId('budget-form').getByLabel('תקציב חודשי בדולרים (USD)'),
    ).toHaveValue('');
  });

  test('health endpoint reports dependencies without leaking details', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ status: 'ok', database: true, redis: true });
    expect(Object.keys(body).sort()).toEqual([
      'database',
      'redis',
      'status',
      'storageConfigured',
      'worker',
    ]);
  });

  test('security headers are present', async ({ request }) => {
    const response = await request.get('/login');
    const headers = response.headers();
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-powered-by']).toBeUndefined();
  });
});
