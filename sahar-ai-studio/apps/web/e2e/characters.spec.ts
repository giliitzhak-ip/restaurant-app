import { expect, test } from '@playwright/test';
import { fixture } from './env';
import { openMainCharacter, register, uniqueEmail, uploadReference } from './helpers';

test.describe('character library', () => {
  test.beforeEach(async ({ page }) => {
    await register(page, { name: 'במאית', email: uniqueEmail('chars') });
  });

  test('every library starts with Sharona Sahar as main character, without an invented photo', async ({
    page,
  }) => {
    await page.goto('/characters');
    const cards = page.getByTestId('character-card');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('שרונה סהר');
    await expect(cards.first()).toContainText('דמות ראשית');
    await expect(cards.first()).toContainText('אין עדיין תמונת ייחוס');

    await openMainCharacter(page);
    await expect(page.getByLabel('מראה ברירת מחדל (הנחיה למודל, באנגלית)')).toHaveValue(
      /Young female Mizrahi singer, long black hair, blue eyes/,
    );
    await expect(page.getByTestId('reference-item')).toHaveCount(0);
    await expect(page.getByText('עדיין לא הועלו תמונות ייחוס.')).toBeVisible();
    await expect(page.getByTestId('clothing-presets')).toContainText('שמלה שחורה אלגנטית');
    await expect(page.getByTestId('style-presets')).toContainText('קולנועי נוסטלגי');
  });

  test('reference images: consent is required, valid images become primary, invalid ones are rejected', async ({
    page,
  }) => {
    await openMainCharacter(page);

    // Without the rights confirmation nothing is uploaded.
    await page.getByTestId('reference-upload-input').setInputFiles(fixture('reference.png'));
    await page.getByTestId('reference-upload-submit').click();
    await expect(page.getByTestId('form-error')).toHaveText(
      'יש לאשר את הצהרת הזכויות לפני ההעלאה.',
    );
    await expect(page.getByTestId('reference-item')).toHaveCount(0);

    // A valid image is stored, verified by the worker, displayed and made primary.
    await page.getByTestId('reference-upload-consent').check();
    await page.getByTestId('reference-upload-submit').click();
    const first = page.getByTestId('reference-item').first();
    await expect(first.locator('img')).toBeVisible({ timeout: 30_000 });
    await expect(first).toHaveAttribute('data-primary', 'true');
    expect(await first.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(
      600,
    );

    // A second image is not primary until chosen.
    await uploadReference(page, fixture('reference.jpg'));
    await expect(page.getByTestId('reference-item')).toHaveCount(2);
    const second = page.getByTestId('reference-item').nth(1);
    await expect(second.locator('img')).toBeVisible({ timeout: 30_000 });
    await expect(second).toHaveAttribute('data-primary', 'false');
    await second.getByRole('button', { name: 'הגדרה כראשית' }).click();
    await expect(page.getByTestId('reference-item').nth(1)).toHaveAttribute('data-primary', 'true');
    await expect(page.getByTestId('reference-item').first()).toHaveAttribute(
      'data-primary',
      'false',
    );

    // Content that is not an image is refused before anything is stored.
    await page.getByTestId('reference-upload-input').setInputFiles(fixture('not-audio.mp3'));
    await page.getByTestId('reference-upload-consent').check();
    await page.getByTestId('reference-upload-submit').click();
    await expect(page.getByTestId('form-error')).toContainText('סוג הקובץ אינו נתמך');
    await expect(page.getByTestId('reference-item')).toHaveCount(2);

    // A real but too-small image fails verification with a Hebrew reason.
    await uploadReference(page, fixture('tiny.png'));
    const failed = page.getByTestId('reference-item').nth(2);
    await expect(failed.getByTestId('asset-status')).toHaveAttribute('data-status', 'FAILED', {
      timeout: 30_000,
    });
    await expect(failed.getByTestId('asset-failure')).toContainText('התמונה קטנה מדי');

    // Deleting removes it.
    page.once('dialog', (dialog) => dialog.accept());
    await failed.getByRole('button', { name: 'מחיקה' }).click();
    await expect(page.getByTestId('reference-item')).toHaveCount(2);

    // Everything persists across a reload.
    await page.reload();
    await expect(page.getByTestId('reference-item')).toHaveCount(2);
    await expect(page.getByTestId('reference-item').nth(1)).toHaveAttribute('data-primary', 'true');
  });

  test('custom characters, details and presets are saved', async ({ page }) => {
    await page.goto('/characters/new');
    await page.getByLabel('שם הדמות').fill('נועה');
    await page.getByLabel('תיאור', { exact: true }).fill('זמרת ליווי');
    await page.getByRole('button', { name: 'יצירת דמות' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'נועה' })).toBeVisible();

    await page.getByLabel('תיאור', { exact: true }).fill('זמרת ליווי בקליפ');
    await page.getByTestId('character-form').getByRole('button', { name: 'שמירה' }).click();
    await expect(page.getByText('הדמות נשמרה.')).toBeVisible();

    const clothing = page.getByTestId('clothing-presets');
    await clothing.getByLabel('שם').fill('מעיל עור');
    await clothing.getByLabel('תיאור להנחיה (באנגלית)').fill('black leather jacket');
    await clothing.getByRole('button', { name: 'הוספה' }).click();
    await expect(clothing).toContainText('black leather jacket');

    await page.reload();
    await expect(page.getByLabel('תיאור', { exact: true })).toHaveValue('זמרת ליווי בקליפ');
    await expect(page.getByTestId('clothing-presets')).toContainText('מעיל עור');

    await page.goto('/characters');
    await expect(page.getByTestId('character-card')).toHaveCount(2);
    // The main character stays first.
    await expect(page.getByTestId('character-card').first()).toContainText('שרונה סהר');
  });
});
