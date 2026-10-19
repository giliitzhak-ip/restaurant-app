import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const PASSWORD = "e2e-secret-12345";

/** Signs in, registering the account on first use (keeps the register rate limit untouched on reruns). */
export async function signIn(request: APIRequestContext, email: string) {
  const login = await request.post("/api/auth/login", { data: { email, password: PASSWORD } });
  if (login.ok()) return;
  const reg = await request.post("/api/auth/register", { data: { name: "בדיקת E2E", email, password: PASSWORD, acceptTerms: true } });
  expect(reg.status(), await reg.text()).toBe(201);
}

export async function shot(page: Page, name: string) {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png`, fullPage: true });
}
