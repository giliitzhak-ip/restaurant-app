import { expect, type Page } from '@playwright/test';

/** In-memory file (lets tests use names the test machine's filesystem/locale cannot). */
export interface FilePayload {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

export const PASSWORD = 'Sahar-Studio-2026!';

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
}

export async function register(page: Page, { name, email }: { name: string; email: string }) {
  await page.goto('/register');
  await page.getByLabel('שם מלא').fill(name);
  await page.getByLabel('אימייל').fill(email);
  await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
  await page.getByLabel('אימות סיסמה').fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'יצירת חשבון' }).click();
  await expect(page).toHaveURL('/');
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'התנתקות' }).click();
  await expect(page).toHaveURL('/login');
}

/** Creates a project through the real form (song streamed to storage, analysed by the worker). */
export async function createProject(
  page: Page,
  { title, song }: { title: string; song: string | FilePayload },
) {
  await page.goto('/projects/new');
  await page.getByLabel('שם הקליפ').fill(title);
  await page.getByTestId('song-input').setInputFiles(song);
  await page.getByTestId('song-consent').check();
  await page.getByTestId('create-project').click();
  await expect(page).toHaveURL(/\/projects\/c[a-z0-9]+$/, { timeout: 30_000 });
  return page.url().split('/').pop()!;
}

export async function waitForSongReady(page: Page) {
  await expect(page.getByTestId('song-card').getByTestId('asset-status')).toHaveAttribute(
    'data-status',
    'READY',
    {
      timeout: 30_000,
    },
  );
}

/** Opens the Sharona Sahar preset (first card: the main character is always listed first). */
export async function openMainCharacter(page: Page) {
  await page.goto('/characters');
  await page.getByTestId('character-card').filter({ hasText: 'שרונה סהר' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'שרונה סהר' })).toBeVisible();
}

export async function uploadReference(page: Page, file: string) {
  await page.getByTestId('reference-upload-input').setInputFiles(file);
  await page.getByTestId('reference-upload-consent').check();
  await page.getByTestId('reference-upload-submit').click();
}
