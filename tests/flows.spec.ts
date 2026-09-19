import { test, expect } from "@playwright/test";

/**
 * The remaining customer journeys: signing up, signing in, asking for a quote
 * and using the room designer.
 */

/** Unique per run, so the suite can be run twice without colliding. */
function freshEmail() {
  return `e2e-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}@example.com`;
}

test.describe("accounts", () => {
  test("a visitor can register, land in their account, and sign back in", async ({ page }) => {
    const email = freshEmail();
    const password = "Sufficiently-Long-1";

    await page.goto("/register");
    await page.locator("#fullName").fill("לקוחה חדשה");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("form button[type=submit]").first().click();

    await page.waitForURL(/\/account/, { timeout: 20_000 });
    await expect(page.getByRole("link", { name: "העיצובים שלי" }).first()).toBeVisible();

    // Sign out, then back in with the same credentials.
    await page.getByRole("button", { name: /התנתקות|יציאה/ }).click();
    await page.waitForURL(/\/$|\/login/, { timeout: 20_000 });

    await page.goto("/login");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("form button[type=submit]").first().click();
    await page.waitForURL(/\/account/, { timeout: 20_000 });
  });

  test("a wrong password says nothing about whether the account exists", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill("definitely-not-a-customer@example.com");
    await page.locator("#password").fill("wrong-password-here");
    await page.locator("form button[type=submit]").first().click();

    await expect(page.getByText("אימייל או סיסמה שגויים")).toBeVisible();
    // No wording that distinguishes "no such account" from "wrong password".
    await expect(page.getByText(/לא קיים|לא נמצא משתמש|אינו רשום/)).toHaveCount(0);
  });
});

test.describe("quotes", () => {
  test("a guest can send a quote request", async ({ page }) => {
    await page.goto("/quote");
    await page.locator("#q-name").fill("דני לוי");
    await page.locator("#q-phone").fill("052-1234567");
    await page.locator("#q-city").fill("חיפה");
    await page.locator("#q-area").fill("42");
    await page.locator("form button[type=submit]").first().click();

    await expect(page.getByText(/QT-/)).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("room designer", () => {
  test("the demo room renders a product onto the floor", async ({ page }) => {
    await page.goto("/designer");
    await page.getByRole("button", { name: /חדר לדוגמה/ }).click();
    await page.waitForSelector("canvas", { timeout: 40_000 });

    await page.getByTestId("designer-swatch").first().click();

    // The canvas has been painted: sample it and require non-uniform pixels.
    const painted = await page.evaluate(async () => {
      const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
      if (!canvas) return false;
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;
      const { data } = ctx.getImageData(0, Math.floor(canvas.height * 0.8), canvas.width, 1);
      const seen = new Set<string>();
      for (let i = 0; i < data.length; i += 4 * 20) {
        seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      }
      return seen.size > 3;
    });
    expect(painted, "the floor should show a rendered texture").toBe(true);

    // And the estimate follows from it.
    await expect(page.getByText(/מ״ר/).first()).toBeVisible();
  });
});
