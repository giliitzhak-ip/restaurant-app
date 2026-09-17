/**
 * End-to-end flow check.
 *
 * Walks the journeys the storefront is built around and prints what it found,
 * so a regression in any of them is one command away:
 *
 *   home → category → filter → sort → product → calculator → cart →
 *   coupon → installation → checkout → order,  quote,
 *   designer (demo room → analyse → apply product → save → add to cart),
 *   admin login → product edit → orders / quotes / designs.
 *
 * Requires a running server and Playwright:
 *
 *   npx playwright install chromium
 *   npm run dev -- -p 3100
 *   node scripts/qa-flows.mjs
 *
 * QA_BASE_URL / PORT choose the target; PLAYWRIGHT_CHROMIUM_PATH points at a
 * Chromium binary if it is not in Playwright's default location.
 *
 * It creates real records (an order, a quote, a saved design). Point it at a
 * throwaway environment, never at production data.
 */
import { chromium } from "playwright";

const base = process.env.QA_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3100}`;
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {},
);
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
const log = (...a) => console.log("•", ...a);

// 1. home → category
await page.goto(base, { waitUntil: "networkidle" });
await page.getByRole("link", { name: "פרקטים", exact: true }).first().click();
await page.waitForURL("**/parquet");
log("category page:", await page.locator("h1").first().innerText());

// 2. filter by tone
await page.getByLabel("בהיר", { exact: true }).first().check().catch(async () => {
  await page.locator("label", { hasText: "בהיר" }).first().click();
});
await page.waitForTimeout(1500);
const url1 = page.url();
const count1 = await page.locator("main ul li article").count();
log("after tone filter:", url1.includes("tone=LIGHT") ? "url ok" : "URL MISSING", "items:", count1);

// sort
await page.locator("select").last().selectOption("price-asc");
await page.waitForTimeout(1200);
log("after sort:", page.url().includes("sort=price-asc") ? "url ok" : "URL MISSING");

// 3. open a product
await page.goto(`${base}/product/spc-oak-light-pro`, { waitUntil: "networkidle" });
log("product:", await page.locator("h1").innerText());

// 4. calculator: 4.2 x 3.05, 10% waste
await page.locator("#\\:R1b\\:-room-0-length").fill("4.2").catch(() => {});
const lengthInput = page.getByLabel("אורך (מ׳)").first();
await lengthInput.fill("4.2");
await page.getByLabel("רוחב (מ׳)").first().fill("3.05");
await page.waitForTimeout(600);
const resultText = await page.locator("[aria-live=polite]").first().innerText();
log("calculator:\n" + resultText.split("\n").map((l) => "    " + l).join("\n"));

// add calculated to cart
await page.getByRole("button", { name: /הוסף לסל לפי החישוב/ }).click();
await page.waitForTimeout(2500);

// 5. cart
await page.goto(`${base}/cart`, { waitUntil: "networkidle" });
const cartText = await page.locator("main").innerText();
log("cart has item:", /SPC אלון בהיר פרו/.test(cartText) ? "yes" : "NO");
log("cart total line:", (cartText.match(/סה״כ לתשלום[\s\S]{0,40}/) ?? [""])[0].replace(/\n/g, " "));

// coupon
await page.getByLabel("קוד הנחה").fill("NEWHOME10");
await page.getByRole("button", { name: "החלה", exact: true }).click();
await page.waitForTimeout(2500);
log("coupon (NEWHOME10, below minimum) →", (await page.locator("body").innerText()).includes("לא הגעתם לסכום המינימלי") ? "correct min-spend message" : "UNEXPECTED");

// installation toggle
await page.getByRole("switch").first().click();
await page.waitForTimeout(2000);
log("installation:", /התקנה/.test(await page.locator("main").innerText()) ? "yes" : "NO");

// 6. checkout
await page.getByRole("link", { name: "מעבר לתשלום" }).click();
await page.waitForURL("**/checkout");
await page.waitForTimeout(2500);
await page.locator("#fullName").fill("בדיקה אוטומטית");
await page.locator("#phone").fill("050-1234567");
await page.locator("#email").fill("qa@example.com");
await page.locator("#street").fill("הרצל 10");
await page.locator("#city").fill("תל אביב");
await page.locator("form button[role=checkbox]").last().click();
await page.getByRole("button", { name: "אישור והזמנה" }).click();
await page.waitForURL("**/order/**", { timeout: 30000 });
log("order confirmed:", (await page.locator("h1").innerText()), "| number:", await page.locator("dd").first().innerText());

// 7. quote
await page.goto(`${base}/quote`, { waitUntil: "networkidle" });
await page.locator("#q-name").fill("בדיקה");
await page.locator("#q-phone").fill("050-7654321");
await page.locator("#q-city").fill("חיפה");
await page.locator("#q-area").fill("42");
await page.getByRole("button", { name: "שליחת הבקשה" }).click();
await page.waitForTimeout(3000);
log("quote:", /הבקשה נשלחה/.test(await page.locator("main").innerText()) ? "sent" : "FAILED");

// 8. designer → demo → apply → save (as guest)
await page.goto(`${base}/designer`, { waitUntil: "networkidle" });
await page.getByText("או התחילו מחדר לדוגמה").click();
await page.waitForTimeout(6500);
const sw = page.locator("aside li button");
await sw.nth(0).click();
await page.waitForTimeout(3000);
await page.getByRole("button", { name: /אהבתי/ }).click();
await page.waitForTimeout(800);
await page.locator("#design-name").fill("הסלון של ה-QA");
await page.getByRole("button", { name: "שמירה", exact: true }).click();
await page.waitForTimeout(3000);
log("design saved toast:", /העיצוב נשמר/.test(await page.locator("body").innerText()) ? "yes" : "NO");

// add design to cart from the designer
await page.getByRole("button", { name: /הוסף לסל/ }).first().click();
await page.waitForTimeout(3500);
log("design added to cart:", /נוסף לסל|מוצרים/.test(await page.locator("body").innerText()) ? "yes" : "NO");

// 9. admin login + product edit
await page.goto(`${base}/login`, { waitUntil: "networkidle" });
await page.locator("#email").fill("admin@terranova.example");
await page.locator("#password").fill("TerraNova!2026");
await page.getByRole("button", { name: "התחברות" }).click();
await page.waitForURL("**/account**", { timeout: 20000 });
log("logged in:", (await page.locator("main, body").first().innerText()).includes("צוות הניהול") ? "yes" : "NO");

await page.goto(`${base}/admin`, { waitUntil: "networkidle" });
log("admin dashboard:", await page.locator("h1").innerText());
await page.goto(`${base}/admin/products`, { waitUntil: "networkidle" });
await page.locator("tbody tr").first().locator("a").first().click();
await page.waitForURL("**/admin/products/**");
const nameField = page.locator("#name");
const original = await nameField.inputValue();
await nameField.fill(original + " ✓");
await page.getByRole("button", { name: "שמירה", exact: true }).click();
await page.waitForURL("**/admin/products", { timeout: 20000 });
log("product saved:", (await page.locator("tbody").innerText()).includes(original + " ✓") ? "yes" : "NO");

// revert
await page.locator("tbody tr", { hasText: original + " ✓" }).first().locator("a").first().click();
await page.waitForURL("**/admin/products/**");
await page.locator("#name").fill(original);
await page.getByRole("button", { name: "שמירה", exact: true }).click();
await page.waitForTimeout(2500);

// 10. account designs
await page.goto(`${base}/account/designs`, { waitUntil: "networkidle" });
log("account designs:", /הסלון של ה-QA/.test(await page.locator("main").innerText()) ? "claimed" : "NOT FOUND");

// 11. admin sees the order + quote + design
await page.goto(`${base}/admin/orders`, { waitUntil: "networkidle" });
log("admin orders:", /בדיקה אוטומטית/.test(await page.locator("main").innerText()) ? "yes" : "NO");
await page.goto(`${base}/admin/quotes`, { waitUntil: "networkidle" });
log("admin quotes:", /חיפה/.test(await page.locator("main").innerText()) ? "yes" : "NO");
await page.goto(`${base}/admin/designs`, { waitUntil: "networkidle" });
log("admin designs:", /הסלון של ה-QA/.test(await page.locator("main").innerText()) ? "yes" : "NO");

console.log("\nconsole errors:", errors.length ? [...new Set(errors)].slice(0, 6).join("\n  ") : "none");
await browser.close();
