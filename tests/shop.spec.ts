import { test, expect } from "@playwright/test";

/**
 * The buying path, end to end, at every breakpoint the design targets.
 *
 * Deliberately goes through the UI rather than hitting server actions: the
 * failures worth catching here are the ones a customer would hit — a card that
 * does not navigate, a calculator that rounds wrong, a summary that disagrees
 * with the cart.
 */

test.describe("storefront", () => {
  test("home → category → product → calculator → cart → checkout", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // No horizontal overflow at any of the tested widths.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);

    await page.goto("/parquet");
    await expect(page.getByRole("heading", { name: "פרקטים" })).toBeVisible();

    const firstProduct = page.locator('a[href^="/product/"]').first();
    await firstProduct.click();
    await page.waitForURL(/\/product\//);

    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();

    // Price per m² and price per package are both stated, on the buy box.
    const priceBlock = page.getByTestId("price-per-unit").first();
    await expect(priceBlock).toBeVisible();
    await expect(priceBlock).toContainText("למ״ר");

    await page.getByTestId("add-to-cart").first().click();
    await expect(page.getByTestId("cart-count")).toHaveText(/[1-9]/);

    await page.goto("/cart");
    await expect(page.getByRole("heading", { name: "סל הקניות" })).toBeVisible();
    const cartTotal = await page.getByTestId("cart-total").textContent();
    expect(cartTotal).toBeTruthy();

    await page.goto("/checkout");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // The order summary carries the same total the cart showed.
    await expect(page.getByTestId("cart-total")).toHaveText(cartTotal!.trim());
  });

  test("the quantity calculator turns square metres into whole packages", async ({ page }) => {
    await page.goto("/product/oak-natural-classic");

    const length = page.getByTestId("calc-length").first();
    const width = page.getByTestId("calc-width").first();
    await length.fill("4");
    await width.fill("3");

    // 12 m² + 10% waste = 13.2 m²; a package covers 2.28 m² → 6 packages.
    await expect(page.getByTestId("calc-units")).toContainText("6");
  });

  test("a guest can reach checkout without an account", async ({ page }) => {
    await page.goto("/product/spc-oak-light-pro");
    await page.getByTestId("add-to-cart").first().click();
    await expect(page.getByTestId("cart-count")).toBeVisible();

    await page.goto("/checkout");
    // The form is there, filled in by the visitor, with no sign-in wall first.
    await expect(page.locator("#fullName")).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.getByRole("button", { name: "אישור והזמנה" })).toBeEnabled();
  });
});
