/**
 * Responsive / RTL smoke test.
 *
 * Loads the key pages at the four breakpoints the design targets and reports
 * HTTP status, document direction, console errors and any horizontal overflow
 * (with the offending element, which is the part that usually takes longest to
 * find by hand).
 *
 * Requires a dev or production server on PORT (default 3100) and Playwright:
 *
 *   npx playwright install chromium
 *   npm run dev -- -p 3100
 *   node scripts/qa-responsive.mjs
 */
import { chromium } from "playwright";

const pages = [
  ["/", "home"],
  ["/catalog", "catalog"],
  ["/parquet", "category"],
  ["/product/panel-slat-oak-natural", "product"],
  ["/collections", "collections"],
  ["/cart", "cart"],
  ["/quote", "quote"],
  ["/faq", "faq"],
  ["/inspiration", "inspiration"],
  ["/login", "login"],
];
const viewports = [
  { width: 375, height: 780, name: "375" },
  { width: 430, height: 860, name: "430" },
  { width: 768, height: 1024, name: "768" },
  { width: 1440, height: 900, name: "1440" },
];

const base = process.env.QA_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3100}`;
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {},
);
const report = [];

for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));

  for (const [path, name] of pages) {
    const url = `${base}${path}`;
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 90000 }).catch((e) => ({ status: () => "ERR " + e.message.slice(0,60) }));
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      const scrollW = Math.max(doc.scrollWidth, document.body.scrollWidth);
      const offenders = [];
      if (scrollW > window.innerWidth + 1) {
        for (const el of document.querySelectorAll("body *")) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && (r.right > window.innerWidth + 2 || r.left < -2)) {
            const style = getComputedStyle(el);
            if (style.position === "fixed" || style.overflowX === "auto" || style.overflowX === "scroll") continue;
            offenders.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ").slice(0,2).join(".")} right=${Math.round(r.right)}`);
            if (offenders.length >= 3) break;
          }
        }
      }
      return { scrollW, innerW: window.innerWidth, offenders };
    });
    const dir = await page.evaluate(() => document.documentElement.dir);
    report.push({
      vp: vp.name, name,
      status: typeof response?.status === "function" ? response.status() : "?",
      dir,
      overflow: overflow.scrollW > overflow.innerW + 1 ? `${overflow.scrollW}>${overflow.innerW} :: ${overflow.offenders.join(" | ")}` : "ok",
    });
    if (process.env.QA_SCREENSHOTS === "1" && (vp.name === "375" || vp.name === "1440")) {
      await page.screenshot({ path: `.qa/${name}-${vp.name}.png`, fullPage: false });
    }
  }
  if (errors.length) report.push({ vp: vp.name, name: "CONSOLE", status: "", dir: "", overflow: [...new Set(errors)].slice(0, 4).join(" | ") });
  await page.close();
}

for (const row of report) {
  console.log([row.vp.padEnd(5), row.name.padEnd(13), String(row.status).padEnd(4), row.dir.padEnd(4), row.overflow].join(" "));
}
await browser.close();
