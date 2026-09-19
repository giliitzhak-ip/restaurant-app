import { test, expect, type Page } from "@playwright/test";

/**
 * Regression tests for the access-control bugs this hardening pass fixed.
 *
 * Each asserts the *attack*, not the fix: if someone later reintroduces a
 * lookup by order number, or drops the guest-token check while refactoring,
 * these go red. That is the only kind of security test worth keeping.
 *
 * They assert on what the visitor can see rather than on status codes, because
 * `next dev` answers a `notFound()` with 200 and a not-found body. The leak is
 * the content, so the content is what is checked.
 */

const PHONE = "050-0000000";
const EMAIL = "idor-probe@example.com";

/** Places a real order through the UI and returns its number and token. */
async function placeOrder(page: Page) {
  await page.goto("/product/spc-oak-light-pro");
  await page.getByTestId("add-to-cart").first().click();
  await expect(page.getByTestId("cart-count")).toBeVisible();

  await page.goto("/checkout");
  // Scoped by id: the footer newsletter box also has an email field.
  await page.locator("#fullName").fill("בדיקה אוטומטית");
  await page.locator("#phone").fill(PHONE);
  await page.locator("#email").fill(EMAIL);
  await page.locator("#street").fill("הרצל 1");
  await page.locator("#city").fill("תל אביב");
  await page.locator('button[role="checkbox"]').first().click();

  await page.getByRole("button", { name: "אישור והזמנה" }).click();
  await page.waitForURL(/\/order\//, { timeout: 30_000 });

  const url = new URL(page.url());
  const number = url.pathname.split("/").filter(Boolean).pop()!;
  const token = url.searchParams.get("token");
  expect(token, "the confirmation link must carry a token").toBeTruthy();
  return { number, token: token! };
}

test.describe("order confirmation", () => {
  test("the order number alone does not open someone's order", async ({ page, browser }) => {
    const { number, token } = await placeOrder(page);

    // The owner, holding the token, sees the order.
    await page.goto(`/order/${number}?token=${encodeURIComponent(token)}`);
    await expect(page.getByText(number, { exact: false })).toBeVisible();
    await expect(page.getByText(PHONE)).toBeVisible();

    // A stranger — separate context, no cookies — sees nothing.
    const stranger = await browser.newContext();
    const strangerPage = await stranger.newPage();

    for (const target of [`/order/${number}`, `/order/${number}?token=not-the-token`]) {
      await strangerPage.goto(target, { waitUntil: "networkidle" });
      const body = await strangerPage.content();
      expect(body, `${target} leaked the phone number`).not.toContain(PHONE);
      expect(body, `${target} leaked the email`).not.toContain(EMAIL);
      expect(body, `${target} leaked the customer name`).not.toContain("בדיקה אוטומטית");
      await expect(strangerPage.getByText("בדיקה אוטומטית")).toHaveCount(0);
    }

    await stranger.close();
  });
});

test.describe("saved designs", () => {
  test("a guest cannot open another guest's design", async ({ browser }) => {
    const owner = await browser.newContext();
    const ownerPage = await owner.newPage();

    await ownerPage.goto("/designer");
    // The demo room needs no upload, so this works without a fixture file.
    await ownerPage.getByRole("button", { name: /חדר לדוגמה/ }).click();
    await ownerPage.waitForSelector("canvas", { timeout: 40_000 });

    // Any product will do; the design only needs one surface filled in, and
    // the save button only appears once something is selected.
    await ownerPage.getByTestId("designer-swatch").first().click();
    await ownerPage.getByTestId("save-design").click();
    await ownerPage.locator("#design-name").fill("עיצוב פרטי");
    await ownerPage.getByRole("button", { name: "שמירה", exact: true }).click();

    await expect
      .poll(
        async () =>
          ownerPage.locator("[data-designer-root]").getAttribute("data-design-id"),
        { timeout: 40_000, message: "the design never saved" },
      )
      .toBeTruthy();

    const designId = await ownerPage
      .locator("[data-designer-root]")
      .getAttribute("data-design-id");

    // A second visitor, with a different guest cookie, must not get it.
    const stranger = await browser.newContext();
    const strangerPage = await stranger.newPage();
    await strangerPage.goto(`/designer?design=${designId}`, { waitUntil: "networkidle" });
    await strangerPage.waitForSelector("[data-designer-root]", { timeout: 40_000 });

    const leaked = await strangerPage
      .locator("[data-designer-root]")
      .getAttribute("data-design-id");
    expect(leaked, "another guest's design must not load").toBeFalsy();
    expect(await strangerPage.content()).not.toContain("עיצוב פרטי");

    await owner.close();
    await stranger.close();
  });

  test("an unknown design id loads an empty designer rather than erroring", async ({ page }) => {
    await page.goto("/designer?design=dsg_does_not_exist", { waitUntil: "networkidle" });
    await page.waitForSelector("[data-designer-root]", { timeout: 40_000 });
    expect(
      await page.locator("[data-designer-root]").getAttribute("data-design-id"),
    ).toBeFalsy();
  });
});

test.describe("privileged routes", () => {
  test("the admin panel redirects an anonymous visitor to login", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "לוח בקרה" })).toHaveCount(0);
  });

  test("the account area redirects an anonymous visitor to login", async ({ page }) => {
    await page.goto("/account/designs");
    await page.waitForURL(/\/login/, { timeout: 15_000 });
  });
});

test.describe("machine endpoints", () => {
  test("the retention job refuses GET and unauthenticated POST", async ({ request }) => {
    const get = await request.get("/api/maintenance/retention");
    expect(get.status(), "a destructive job must not be reachable by GET").toBe(405);

    const post = await request.post("/api/maintenance/retention");
    // 401 when a token is configured, 503 when it is not — never 200.
    expect([401, 503]).toContain(post.status());
  });

  test("the payment webhook rejects an unsigned callback", async ({ request }) => {
    const response = await request.post("/api/payments/webhook", {
      data: { reference: "TN-0000-000001", status: "paid", amount: 1, currency: "ILS" },
    });
    // 404 with the offline provider configured, 400 once a gateway is wired up.
    expect([400, 404]).toContain(response.status());
  });
});
