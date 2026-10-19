import { expect, test } from '@playwright/test';
import { register, uniqueEmail } from './helpers';

test.describe('iPhone layout', () => {
  test('drawer navigation works and nothing overflows horizontally', async ({ page }) => {
    await register(page, { name: 'אייפון', email: uniqueEmail('mobile') });

    // Desktop sidebar is hidden; the top bar menu button is the way in.
    await expect(page.getByTestId('desktop-nav')).toBeHidden();
    const noHorizontalOverflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await noHorizontalOverflow()).toBe(true);

    await page.getByTestId('mobile-menu-button').click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    // Drawer opens from the right edge in Hebrew.
    const box = (await drawer.boundingBox())!;
    expect(Math.round(box.x + box.width)).toBe(page.viewportSize()!.width);

    await drawer.getByRole('link', { name: 'ספריית דמויות' }).click();
    await expect(drawer).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'ספריית דמויות' })).toBeVisible();
    expect(await noHorizontalOverflow()).toBe(true);

    for (const path of ['/settings', '/renders', '/scenes']) {
      await page.goto(path);
      expect(await noHorizontalOverflow(), `overflow on ${path}`).toBe(true);
    }

    // Inputs use ≥16px text so iOS Safari does not zoom on focus.
    await page.goto('/settings');
    const fontSize = await page
      .getByLabel('תקציב חודשי בדולרים (USD)')
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);

    await page.getByTestId('mobile-menu-button').click();
    await page.getByRole('dialog').getByRole('button', { name: 'התנתקות' }).click();
    await expect(page).toHaveURL('/login');
  });
});
