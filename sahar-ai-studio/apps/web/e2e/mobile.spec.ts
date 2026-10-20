import { expect, test } from '@playwright/test';
import { fixture } from './env';
import { createProject, register, uniqueEmail, waitForSongReady } from './helpers';

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

  test('song upload and timeline editing work on iPhone', async ({ page }) => {
    await register(page, { name: 'אייפון', email: uniqueEmail('mobile-tl') });
    const projectId = await createProject(page, { title: 'נייד', song: fixture('song.mp3') });
    await waitForSongReady(page);
    const noOverflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await noOverflow()).toBe(true);

    await page.goto(`/projects/${projectId}/timeline`);
    const blocks = page.getByTestId('scene-block');
    await expect(blocks).toHaveCount(3);
    expect(await noOverflow()).toBe(true);
    // Time axis stays left-to-right inside the Hebrew page.
    const firstBox = (await blocks.first().boundingBox())!;
    const secondBox = (await blocks.nth(1).boundingBox())!;
    expect(secondBox.x).toBeGreaterThan(firstBox.x);

    // Tap a scene, then tap "split" (icon button with an accessible name).
    await blocks.first().tap();
    await expect(page.getByTestId('timeline-status')).toContainText('סצנה 1');
    await page.getByRole('button', { name: 'הגדלה' }).tap();
    await page.getByTestId('timeline-zoom-in').tap();
    const geoBox = (await blocks.first().boundingBox())!;
    const endMs = Number(await blocks.first().getAttribute('data-end'));
    await page.touchscreen.tap(
      geoBox.x + (geoBox.width * 3_000) / endMs,
      geoBox.y + geoBox.height + 40,
    );
    await page.getByTestId('timeline-split').tap();
    await expect(blocks).toHaveCount(4);
    await page.getByTestId('timeline-save').tap();
    await expect(page.getByText('החלוקה נשמרה.')).toBeVisible();

    // Boundary handles are large enough for a finger (≥ 24 px wide hit area).
    const handle = (await page.getByTestId('boundary-handle').first().boundingBox())!;
    expect(handle.width).toBeGreaterThanOrEqual(24);
  });
});

test.describe('iPhone studio', () => {
  test('generate a test video and get a playable, downloadable take on iPhone', async ({
    page,
  }) => {
    await register(page, { name: 'אייפון', email: uniqueEmail('mobile-studio') });
    await createProject(page, { title: 'נייד', song: fixture('song.mp3') });
    await waitForSongReady(page);
    await page.goto('/studio');
    await expect(page.getByTestId('estimate-amount')).toHaveText('$0.00');
    await page.getByTestId('approve-estimate').tap();
    await page.getByTestId('generate').tap();
    const row = page.getByTestId('job-row').first();
    await expect(row).toHaveAttribute('data-status', 'COMPLETED', { timeout: 60_000 });
    const video = page.getByTestId('take-video').first();
    expect(await video.evaluate((v: HTMLVideoElement) => v.playsInline)).toBe(true);
    await expect(page.getByTestId('take-download').first()).toHaveAttribute(
      'href',
      /\/api\/media\/.+\?download=1$/,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});
