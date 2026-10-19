import { expect, type Page } from '@playwright/test';

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
