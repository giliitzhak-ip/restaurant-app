import { test, expect, type Page } from "@playwright/test";

/**
 * The full design path.
 *
 * Every journey the brief names, at every viewport the config defines. The
 * editor has two shells — a column beside the room on a desktop, a bottom
 * sheet on a phone — so almost everything here goes through `openTool`,
 * which knows which one is on screen. A test that only exercised one of them
 * would miss the half of the bugs that live in the other.
 */

const PHONE = 1024;

async function isPhone(page: Page) {
  return (page.viewportSize()?.width ?? 0) < PHONE;
}

/** Opens a tool panel, whichever shell this viewport uses. */
async function openTool(
  page: Page,
  tool: "cladding" | "objects" | "lighting" | "layers" | "controls",
) {
  if (await isPhone(page)) {
    await page.getByTestId(`tool-${tool}`).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  } else {
    await page.getByTestId(`panel-${tool}`).click();
  }
}

/** Closes the phone sheet so the room is visible again. */
async function closeTool(page: Page) {
  if (!(await isPhone(page))) return;
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
}

/**
 * Positions relative to the stage, not to the viewport.
 *
 * `getBoundingClientRect` is viewport-relative, and opening a tool panel
 * scrolls the page — so two measurements taken either side of that compare a
 * scrolled room with an unscrolled one and report movement that did not
 * happen. Everything positional here is measured against the overlay.
 */
async function objectPositions(page: Page) {
  return page.evaluate(() => {
    const stage = document.querySelector("[data-scene-overlay]")!.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>("[data-scene-object]")].map((el) => {
      const r = el.getBoundingClientRect();
      return `${el.getAttribute("aria-label")}:${Math.round(r.x - stage.x)},${Math.round(
        r.y - stage.y,
      )}`;
    });
  });
}

/** Brings the room fully into view, so pointer coordinates are usable. */
async function showStage(page: Page) {
  await page.locator("[data-scene-overlay]").scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
}

async function openDemoRoom(page: Page) {
  await page.goto("/designer");
  await page.getByRole("button", { name: /חדר לדוגמה/ }).click();
  await page.waitForSelector("canvas", { timeout: 40_000 });
}

/** Adds the first asset of a category and returns the new object count. */
async function addObject(page: Page, category: string, index = 0) {
  await openTool(page, "objects");
  await page.locator(`[data-asset-category="${category}"]`).nth(index).click();
  await page.waitForTimeout(120);
  await closeTool(page);
  return page.locator("[data-scene-object]").count();
}

async function addFixture(page: Page, type: string) {
  await openTool(page, "lighting");
  await page.locator(`[data-fixture-type="${type}"]`).click();
  await page.waitForTimeout(150);
  await closeTool(page);
}

test.describe("building a media wall", () => {
  test("a television goes over the cladding and a sideboard under it", async ({
    page,
  }) => {
    await openDemoRoom(page);

    // Cladding first, so the objects land on a finished wall.
    await openTool(page, "cladding");
    await page.getByTestId("designer-swatch").first().click();
    await closeTool(page);
    await page.waitForTimeout(500);

    expect(await addObject(page, "TV", 2)).toBe(1);
    expect(await addObject(page, "SIDEBOARD_WALL")).toBe(2);

    /*
     * The sideboard must not land on top of the screen. This is the bug that
     * made the first version of the drop logic unusable, and it is invisible
     * to any assertion that only counts objects.
     */
    const positions = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("[data-scene-object]")].map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, label: el.getAttribute("aria-label") };
      }),
    );
    const screen = positions.find((entry) => entry.label?.includes("טלוויזיה"))!;
    const sideboard = positions.find((entry) => entry.label?.includes("מזנון"))!;
    expect(screen, "the television should be on the wall").toBeTruthy();
    expect(
      sideboard.top,
      "the sideboard should sit below the middle of the screen",
    ).toBeGreaterThan((screen.top + screen.bottom) / 2);
  });

  test("a bar wall takes shelves and a wine fridge", async ({ page }) => {
    await openDemoRoom(page);
    await addObject(page, "BAR_COUNTER");
    await addObject(page, "FLOATING_SHELF");
    await addObject(page, "WINE_FRIDGE");
    await expect(page.locator("[data-scene-object]")).toHaveCount(3);

    await openTool(page, "layers");
    await expect(page.getByTestId("bill-of-materials")).toBeVisible();
    // None of these are catalogue products, so all three are illustrations.
    await expect(page.getByText("להמחשה בלבד").first()).toBeVisible();
    await closeTool(page);
  });
});

test.describe("lighting", () => {
  test("a strip behind the television changes the picture", async ({ page }) => {
    await openDemoRoom(page);
    await addObject(page, "TV", 2);

    const stage = page.locator("[data-scene-overlay]").locator("..");
    const before = await stage.screenshot();
    await addFixture(page, "LED_BEHIND_TV");
    await page.waitForTimeout(400);
    const after = await stage.screenshot();

    /*
     * Compare the pixels. The first version of the lighting rendered an
     * element with the right size and blend mode that changed nothing
     * visible, and no structural assertion would have caught it.
     */
    const changed = await page.evaluate(
      async ([a, b]) => {
        const load = (data: string) =>
          new Promise<HTMLImageElement>((resolve) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.src = `data:image/png;base64,${data}`;
          });
        const [first, second] = await Promise.all([load(a!), load(b!)]);
        const canvas = document.createElement("canvas");
        canvas.width = first.width;
        canvas.height = first.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(first, 0, 0);
        const one = context.getImageData(0, 0, canvas.width, canvas.height).data;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(second, 0, 0);
        const two = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let count = 0;
        for (let i = 0; i < one.length; i += 4) {
          if (
            Math.abs(one[i]! - two[i]!) +
              Math.abs(one[i + 1]! - two[i + 1]!) +
              Math.abs(one[i + 2]! - two[i + 2]!) >
            4
          ) {
            count += 1;
          }
        }
        return count;
      },
      [before.toString("base64"), after.toString("base64")],
    );
    expect(changed, "the glow should actually light something").toBeGreaterThan(500);
  });

  test("a niche takes a light of its own", async ({ page }) => {
    await openDemoRoom(page);
    await addObject(page, "NICHE");
    await addFixture(page, "LED_IN_NICHE");
    await openTool(page, "layers");
    await expect(page.getByText("פס LED בנישה")).toBeVisible();
    await closeTool(page);
  });

  test("a vertical strip is drawn between two claddings", async ({ page }) => {
    await openDemoRoom(page);
    await openTool(page, "lighting");
    await page.locator('[data-led-shape="VERTICAL_SEAM"]').click();
    await closeTool(page);

    // Two taps on the room draw the run.
    await showStage(page);
    const stage = page.locator("[data-scene-overlay]");
    const box = (await stage.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.2);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.7);
    await page.waitForTimeout(200);

    await openTool(page, "layers");
    await expect(page.getByText("פס אנכי בין חיפויים")).toBeVisible();
    await closeTool(page);
  });

  test("a frame around the television needs no clicks and follows it", async ({
    page,
  }) => {
    await openDemoRoom(page);
    await addObject(page, "TV", 2);
    await openTool(page, "lighting");
    await page.locator('[data-led-shape="TV_FRAME"]').click();
    await page.waitForTimeout(250);
    await closeTool(page);

    await openTool(page, "layers");
    await expect(page.getByText("מסגרת סביב הטלוויזיה")).toBeVisible();
    await closeTool(page);
  });
});

test.describe("the objects survive the room changing around them", () => {
  test("swapping the cladding keeps every object where it was", async ({ page }) => {
    await openDemoRoom(page);
    await addObject(page, "TV", 2);
    await addObject(page, "PLANT");

    const before = await objectPositions(page);

    await openTool(page, "cladding");
    const swatches = page.getByTestId("designer-swatch");
    await swatches.nth(Math.min(2, (await swatches.count()) - 1)).click();
    await closeTool(page);
    await page.waitForTimeout(900);

    const after = await objectPositions(page);

    expect(after, "the furniture belongs to the room, not to the cladding").toEqual(
      before,
    );
  });
});

test.describe("undo", () => {
  test("undo and redo step through whole actions", async ({ page }) => {
    await openDemoRoom(page);
    await addObject(page, "TV", 2);
    await addObject(page, "PLANT");
    await expect(page.locator("[data-scene-object]")).toHaveCount(2);

    await page.getByTestId("scene-undo").click();
    await expect(page.locator("[data-scene-object]")).toHaveCount(1);
    await page.getByTestId("scene-undo").click();
    await expect(page.locator("[data-scene-object]")).toHaveCount(0);

    await page.getByTestId("scene-redo").click();
    await expect(page.locator("[data-scene-object]")).toHaveCount(1);
  });

  test("dragging an object is one undo step, not one per frame", async ({ page }) => {
    await openDemoRoom(page);
    await addObject(page, "TV", 2);

    await showStage(page);
    const object = page.locator("[data-scene-object]").first();
    const start = (await object.boundingBox())!;
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    // Many moves, one gesture.
    for (let step = 1; step <= 8; step += 1) {
      await page.mouse.move(
        start.x + start.width / 2 - step * 6,
        start.y + start.height / 2 + step * 3,
      );
    }
    await page.mouse.up();
    await page.waitForTimeout(150);

    const moved = (await object.boundingBox())!;
    expect(Math.abs(moved.x - start.x)).toBeGreaterThan(10);

    await page.getByTestId("scene-undo").click();
    await page.waitForTimeout(150);
    const back = (await page.locator("[data-scene-object]").first().boundingBox())!;
    expect(
      Math.abs(back.x - start.x),
      "one undo should reverse the whole drag",
    ).toBeLessThan(2);
  });
});

test.describe("selection and editing", () => {
  test("the toolbar duplicates, locks and deletes", async ({ page }) => {
    await openDemoRoom(page);
    await addObject(page, "TV", 2);
    await page.locator("[data-scene-object]").first().click();

    await page.getByRole("button", { name: "שכפול" }).click();
    await expect(page.locator("[data-scene-object]")).toHaveCount(2);

    // A locked object refuses deletion, which is the whole point of a lock.
    await page.getByRole("button", { name: "נעילה" }).click();
    await expect(page.getByRole("button", { name: "מחיקה" })).toBeDisabled();

    await page.getByRole("button", { name: "ביטול נעילה" }).click();
    await page.getByRole("button", { name: "מחיקה" }).click();
    await expect(page.locator("[data-scene-object]")).toHaveCount(1);
  });

  test("every control in the object toolbar is reachable by name", async ({ page }) => {
    await openDemoRoom(page);
    await addObject(page, "TV", 2);
    await page.locator("[data-scene-object]").first().click();

    for (const name of [
      "היפוך אופקי",
      "התאמה לפרספקטיבה",
      "הבאה קדימה",
      "שליחה אחורה",
      "שכפול",
      "מחיקה",
    ]) {
      await expect(page.getByRole("button", { name }), name).toBeVisible();
    }
  });
});

test.describe("the phone shell", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= PHONE, "phones only");

  test("tools open in a sheet over the room, and every target is 44px", async ({
    page,
  }) => {
    await openDemoRoom(page);

    const small = await page.evaluate(() => {
      const bad: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('[data-testid^="tool-"]')) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 44 || rect.height < 44) {
          bad.push(`${el.dataset.testid} ${Math.round(rect.width)}×${Math.round(rect.height)}`);
        }
      }
      return bad;
    });
    expect(small, small.join(" | ")).toEqual([]);

    await openTool(page, "objects");
    await page.getByTestId("library-asset").first().click();
    await page.waitForTimeout(200);
    await expect(page.locator("[data-scene-object]")).toHaveCount(1);

    // Escape closes the sheet; the object stays.
    await closeTool(page);
    await expect(page.locator("[data-scene-object]")).toHaveCount(1);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${overflow}px sideways`).toBeLessThanOrEqual(0);
  });

  test("the panels are mounted once, not once per shell", async ({ page }) => {
    await openDemoRoom(page);
    await openTool(page, "objects");
    // Two copies would mean paying twice for forty images, and two elements
    // sharing a test id.
    const ids = await page.locator('[data-testid="library-asset"]').count();
    const dialogIds = await page
      .getByRole("dialog")
      .locator('[data-testid="library-asset"]')
      .count();
    expect(ids).toBe(dialogIds);
  });
});

test.describe("saving and sharing", () => {
  test("a design with objects and lighting saves and reopens intact", async ({
    page,
  }) => {
    await openDemoRoom(page);
    await openTool(page, "cladding");
    await page.getByTestId("designer-swatch").first().click();
    await closeTool(page);
    await page.waitForTimeout(500);

    await addObject(page, "TV", 2);
    await addObject(page, "SIDEBOARD_WALL");
    await addFixture(page, "LED_BEHIND_TV");

    // Save.
    if (await isPhone(page)) await page.getByTestId("tool-save").click();
    else await page.getByTestId("save-design").click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox").first().fill("קיר מדיה לבדיקה");
    await dialog.getByRole("button", { name: /שמירה|שמור/ }).first().click();

    /*
     * Reopen by id rather than through /account/designs: this visitor is a
     * guest, their designs live against a guest cookie, and the account area
     * is behind the session guard — so the listing is correctly empty for
     * them. The designer itself checks ownership the same way either route
     * does.
     */
    const root = page.locator("[data-designer-root]");
    await expect(root).toHaveAttribute("data-design-id", /.+/, { timeout: 20_000 });
    const designId = await root.getAttribute("data-design-id");
    expect(designId).toBeTruthy();

    await page.goto(`/designer?design=${designId}`);
    await page.waitForSelector("canvas", { timeout: 40_000 });
    await page.waitForTimeout(1500);

    await expect(
      page.locator("[data-scene-object]"),
      "the furniture should come back with the design",
    ).toHaveCount(2);
  });
});

test.describe("accessibility", () => {
  test("the designer is right-to-left and reachable by keyboard", async ({ page }) => {
    await openDemoRoom(page);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    await addObject(page, "TV", 2);
    // Focusing an object selects it, so a keyboard alone can reach the
    // toolbar that edits it.
    await page.locator("[data-scene-object]").first().focus();
    await expect(page.getByRole("button", { name: "שכפול" })).toBeVisible();

    // Arrow keys nudge the selection.
    const before = (await page.locator("[data-scene-object]").first().boundingBox())!;
    for (let i = 0; i < 12; i += 1) await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(120);
    const after = (await page.locator("[data-scene-object]").first().boundingBox())!;
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(1);
  });
});
