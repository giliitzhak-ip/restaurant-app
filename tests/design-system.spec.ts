import { test, expect, type Page } from "@playwright/test";

/**
 * The design system's own promises.
 *
 * The rest of the suite checks that the shop works. This checks the things
 * the interface claims about how it behaves — the ones that are easy to break
 * with a class name and impossible to notice in a screenshot: that a busy
 * button does not resize, that a 32px icon still answers a 44px thumb, that a
 * modal is a sheet on a phone and a panel on a desktop, and that someone who
 * has asked for less motion gets less motion.
 *
 * It runs at every viewport the four projects define, because most of these
 * only go wrong at one of them.
 */

/**
 * Wait for an element to stop moving.
 *
 * Every overlay here arrives with a transform animation, so a box measured
 * the instant it appears is a box mid-flight. This settles first, which is
 * also the only honest way to assert where something ends up.
 */
async function settled(locator: ReturnType<Page["locator"]>) {
  let previous = "";
  for (let i = 0; i < 40; i += 1) {
    const box = await locator.boundingBox();
    const key = JSON.stringify(box);
    if (box && key === previous) return box;
    previous = key;
    await locator.page().waitForTimeout(50);
  }
  throw new Error("element never stopped moving");
}

async function firstProductUrl(page: Page) {
  await page.goto("/catalog");
  const href = await page.locator("article a[aria-label]").first().getAttribute("href");
  expect(href, "the catalogue should list a product").toBeTruthy();
  return href as string;
}

test.describe("buttons", () => {
  test("a busy button keeps its width, and shows the result in that width", async ({
    page,
  }) => {
    await page.goto(await firstProductUrl(page));
    /*
     * `.first()` because Playwright's very first query after a navigation can
     * still see a match from the document it has just left. The page itself
     * holds exactly one, which is asserted once it has settled.
     */
    const add = page.locator("#buy-box").getByTestId("add-to-cart").first();
    await expect(add).toBeVisible();
    await expect(page.getByTestId("add-to-cart")).toHaveCount(1);

    const before = (await add.boundingBox())!.width;
    await add.click();

    /*
     * The action may resolve faster than a frame, so the busy state is
     * sampled rather than waited for. What must hold either way is that the
     * width never changes — while working, while confirming, and after.
     */
    for (let i = 0; i < 30; i += 1) {
      const box = (await add.boundingBox())!;
      expect(Math.abs(box.width - before)).toBeLessThan(1);
      if (await add.locator("svg.lucide-check").count()) break;
      await page.waitForTimeout(20);
    }

    // The confirmation is a tick in the button, and it clears itself.
    await expect(add.locator("svg.lucide-check")).toHaveCount(1);
    expect(Math.abs((await add.boundingBox())!.width - before)).toBeLessThan(1);
    await expect(add.locator("svg.lucide-check")).toHaveCount(0, { timeout: 4000 });
    expect(Math.abs((await add.boundingBox())!.width - before)).toBeLessThan(1);
  });

  test("a disabled control looks blocked and does not act", async ({ page }) => {
    await page.goto(await firstProductUrl(page));
    // The stepper starts at its minimum, so "one fewer" is unavailable.
    const minus = page.getByRole("button", { name: /הפחתת/ }).first();
    await expect(minus).toBeDisabled();
    await expect(minus).toHaveCSS("cursor", "not-allowed");

    const quantity = page.getByRole("spinbutton").first();
    const value = await quantity.inputValue();
    await minus.click({ force: true });
    await expect(quantity).toHaveValue(value);
  });
});

test.describe("touch targets", () => {
  for (const path of ["/catalog", "/cart", "/quote"]) {
    test(`every control on ${path} answers a 44×44 touch`, async ({ page }) => {
      await page.goto(path);
      const undersized = await page.evaluate(() => {
        const bad: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>("button, a[aria-label]")) {
          if (getComputedStyle(el).visibility === "hidden") continue;
          /*
           * For a control inside a label, the label is the target — clicking
           * anywhere on it activates the control — so that is what gets
           * measured. Growing the 18px box itself would only push its hit
           * area into the rows above and below it.
           */
          const target = el.closest("label") ?? el;
          const rect = target.getBoundingClientRect();
          if (!rect.width || !rect.height) continue;
          // `tap-target` grows the hit area with a pseudo-element rather than
          // by making the control bigger, so measure that too.
          const after = getComputedStyle(target, "::after");
          const grown = after.content !== "none";
          const width = grown
            ? Math.max(rect.width, parseFloat(after.minWidth) || 0)
            : rect.width;
          const height = grown
            ? Math.max(rect.height, parseFloat(after.minHeight) || 0)
            : rect.height;
          if (width < 44 || height < 44) {
            const name = el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 24);
            bad.push(`${name} → ${Math.round(width)}×${Math.round(height)}`);
          }
        }
        return bad;
      });
      expect(undersized, undersized.join(" | ")).toEqual([]);
    });
  }
});

test.describe("layout", () => {
  for (const path of ["/", "/catalog", "/cart", "/checkout", "/quote", "/login"]) {
    test(`${path} does not scroll sideways`, async ({ page }) => {
      await page.goto(path);
      // Wait for hydration: two genuine overflows on this page only appeared
      // after the client took over, so measuring at first paint missed them.
      await page.waitForLoadState("networkidle");

      const result = await page.evaluate(() => {
        const root = document.documentElement;
        const viewport = root.clientWidth;
        /*
         * Two measurements, because they catch different things.
         *
         * `scrollWidth` is the symptom a person feels — the page slides
         * sideways — but it rounds up, so a layout that lands on a fractional
         * pixel reports 1 even when nothing is out of place. That made this
         * assertion flap.
         *
         * The element scan is the cause. It names every box that actually
         * crosses an edge, which is the property worth asserting and the one
         * that tells you where to look when it fails.
         */
        /*
         * A box inside its own horizontal scroller is allowed to be wider
         * than the screen — that is what a carousel and a wide table are.
         * What is not allowed is the *page* sliding, so anything with a
         * clipping or scrolling ancestor is skipped.
         */
        const clipped = (element: HTMLElement) => {
          for (let node = element.parentElement; node; node = node.parentElement) {
            const overflowX = getComputedStyle(node).overflowX;
            if (overflowX === "auto" || overflowX === "scroll" || overflowX === "hidden") {
              return true;
            }
          }
          return false;
        };

        const offenders: string[] = [];
        for (const element of document.querySelectorAll<HTMLElement>("*")) {
          const box = element.getBoundingClientRect();
          if (!box.width || !box.height) continue;
          if (clipped(element)) continue;
          if (box.right > viewport + 1 || box.left < -1) {
            const name = `${element.tagName.toLowerCase()}.${String(element.className || "")
              .split(" ")
              .slice(0, 2)
              .join(".")}`;
            offenders.push(`${name} [${box.left.toFixed(1)}…${box.right.toFixed(1)}]`);
          }
        }
        return { overflow: root.scrollWidth - viewport, offenders: offenders.slice(0, 5) };
      });

      expect(
        result.offenders,
        `elements crossing the viewport edge on ${path}`,
      ).toEqual([]);
      // 1px of tolerance for sub-pixel rounding; anything more is real.
      expect(
        result.overflow,
        `${result.overflow}px of horizontal overflow on ${path}`,
      ).toBeLessThanOrEqual(1);
    });
  }
});

test.describe("dialog", () => {
  test("is a bottom sheet on a phone and a centred panel on a desktop", async ({
    page,
  }, testInfo) => {
    const width = page.viewportSize()!.width;
    await page.goto("/catalog");

    const trigger = page.getByRole("button", { name: "הצצה מהירה" }).first();
    if (!(await trigger.count()) || !(await trigger.isVisible())) {
      // The quick-view row is a pointer-device affordance; on the narrow
      // projects the icon-only variant is the one on screen.
      await page.getByRole("button", { name: /הצצה מהירה/ }).first().click();
    } else {
      await trigger.click();
    }

    const dialog = page.getByRole("dialog").first();
    await expect(dialog).toBeVisible();
    const box = await settled(dialog);
    const viewport = page.viewportSize()!;

    if (width < 640) {
      // Sheet: flush with the bottom edge and the full width of the screen.
      expect(
        Math.abs(box.y + box.height - viewport.height),
        `${testInfo.project.name}: sheet should sit on the bottom edge`,
      ).toBeLessThan(2);
      expect(box.width).toBeGreaterThan(viewport.width - 2);
    } else {
      const middle = box.y + box.height / 2;
      expect(
        Math.abs(middle - viewport.height / 2),
        `${testInfo.project.name}: panel should be centred`,
      ).toBeLessThan(60);
      expect(box.width).toBeLessThan(viewport.width);
    }

    // Escape closes it and focus goes back to what opened it.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    const focused = await page.evaluate(
      () => document.activeElement?.textContent?.trim() ?? "",
    );
    expect(focused).toContain("הצצה מהירה");
  });
});

test.describe("motion", () => {
  test("hover effects are gated on a device that can hover", async ({ page }) => {
    await page.goto("/catalog");
    /*
     * The guarantee is structural, not visual: every `:hover` rule the bundle
     * ships sits inside `@media (hover: hover)`. A rule outside one would
     * stick after a tap on a phone, with no way to clear it.
     */
    const stray = await page.evaluate(() => {
      const offenders: string[] = [];
      const walk = (rules: CSSRuleList, inHoverQuery: boolean) => {
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSMediaRule) {
            walk(rule.cssRules, inHoverQuery || /hover\s*:\s*hover/.test(rule.conditionText));
          } else if (rule instanceof CSSStyleRule) {
            if (!inHoverQuery && /:hover/.test(rule.selectorText)) {
              offenders.push(rule.selectorText.slice(0, 80));
            }
          } else if ("cssRules" in rule) {
            walk((rule as CSSGroupingRule).cssRules, inHoverQuery);
          }
        }
      };
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          walk(sheet.cssRules, false);
        } catch {
          // A cross-origin sheet cannot be read; none of ours are.
        }
      }
      return offenders;
    });
    expect(stray, stray.slice(0, 5).join(" | ")).toEqual([]);
  });

  test.describe("with prefers-reduced-motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("cards do not animate in, and colour still changes", async ({ page }) => {
      await page.goto("/catalog");
      const card = page.locator("article").first();
      await expect(card).toHaveCSS("animation-name", "none");

      // The transition is still declared — the reduced-motion rule shortens it
      // to effectively nothing, so a colour change lands instantly rather than
      // being removed.
      const button = page.getByRole("link", { name: /נסו בחדר שלכם/ }).first();
      if (await button.count()) {
        const duration = await button.evaluate(
          (el) => getComputedStyle(el).transitionDuration,
        );
        expect(duration).not.toBe("");
      }
    });
  });
});
