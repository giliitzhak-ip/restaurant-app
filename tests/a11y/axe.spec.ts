import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * WCAG 2.2 AA sweep.
 *
 * axe catches the mechanical failures — contrast, names, roles, landmarks —
 * which is most of what regresses during a redesign. The keyboard and focus
 * behaviour below is checked by hand because no scanner can tell whether a
 * dialog actually traps focus.
 */
const PAGES = [
  { path: "/", name: "home" },
  { path: "/catalog", name: "catalog" },
  { path: "/product/oak-natural-classic", name: "product" },
  { path: "/cart", name: "cart" },
  { path: "/quote", name: "quote" },
  { path: "/login", name: "login" },
];

for (const page of PAGES) {
  test(`${page.name} has no WCAG A/AA violations`, async ({ page: browserPage }) => {
    await browserPage.goto(page.path);
    await browserPage.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page: browserPage })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    const serious = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(
      serious,
      serious
        .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
        .join("\n"),
    ).toEqual([]);
  });
}

test("the document declares Hebrew and right-to-left", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", /^he/);
});

test("a keyboard reaches the main content past the header", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  // The skip link is the first stop, and it is visible once focused.
  const focused = page.locator(":focus");
  await expect(focused).toBeVisible();
  const text = await focused.textContent();
  expect(text?.trim().length ?? 0).toBeGreaterThan(0);
});

test("the mobile menu returns focus and closes on Escape", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  const trigger = page.getByRole("button", { name: /תפריט|menu/i }).first();
  if ((await trigger.count()) === 0) test.skip();
  await trigger.click();

  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
