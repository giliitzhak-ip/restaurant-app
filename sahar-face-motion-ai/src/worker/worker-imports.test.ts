import { describe, expect, it } from "vitest";

// The worker runs under plain Node (tsx), not Next.js: anything it imports must not
// pull in "server-only" or other Next-only modules, or the worker dies at startup.
describe("worker modules load outside Next.js", () => {
  it("imports the media and AI job runners", async () => {
    await expect(import("./media-job")).resolves.toBeTruthy();
    await expect(import("./ai-job")).resolves.toBeTruthy();
  });
});
