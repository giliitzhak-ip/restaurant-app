import { test, expect } from "@playwright/test";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import fs from "node:fs";
import { makeFixtures } from "../src/test/fixtures";
import { analyzeProbe, ffprobe } from "../src/server/media/probe";
import { mediaLimits } from "../src/server/media/policy";
import { shot, signIn } from "./helpers";

let fx: ReturnType<typeof makeFixtures>;
test.beforeAll(() => {
  fx = makeFixtures();
});
test.afterAll(() => fx.cleanup());

async function countObjects(prefix: string): Promise<number | null> {
  if (!process.env.S3_TEST_ENDPOINT) return null;
  const s3 = new S3Client({
    endpoint: process.env.S3_TEST_ENDPOINT,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" },
  });
  const res = await s3.send(new ListObjectsV2Command({ Bucket: process.env.S3_TEST_BUCKET ?? "sahar-media", Prefix: prefix }));
  return res.KeyCount ?? 0;
}

test("project library: create, upload, validate, preview, duplicate, delete", async ({ page, browser }, info) => {
  const tag = info.project.name;
  await signIn(page.request, `e2e-${tag}@test.local`);
  const me = (await (await page.request.get("/api/auth/me")).json()).user;
  // Start from an empty library (leftovers from an interrupted run).
  for (const p of (await (await page.request.get("/api/projects")).json()).projects) await page.request.delete(`/api/projects/${p.id}`);

  // Create
  await page.goto("/projects");
  const newBtn = page.getByRole("button", { name: "פרויקט חדש" });
  if (await newBtn.isVisible()) await newBtn.click();
  await page.getByLabel("שם הפרויקט").fill(`ריקוד חתונה ${tag}`);
  await page.getByRole("radiogroup").getByText("16:9", { exact: true }).click();
  await page.getByRole("button", { name: "יצירה" }).click();
  await page.waitForURL(/\/projects\/[\w-]+$/);
  const projectId = page.url().split("/").pop()!;
  await expect(page.getByRole("heading", { name: `ריקוד חתונה ${tag}` })).toBeVisible();

  // Upload: valid image, landscape MP4, iPhone HEVC MOV, MP3, and a fake MP4
  await page.locator("input[type=file]").setInputFiles([
    fx.f("photo.jpg"),
    fx.f("dance.mp4"),
    fx.f("iphone.mov"),
    fx.f("voice.mp3"),
    fx.f("fake.mp4"),
  ]);
  await expect(page.getByText("הועלה", { exact: true })).toHaveCount(5, { timeout: 60_000 });

  // Worker validates with FFprobe and builds previews
  await expect(page.getByText("הקובץ פגום או שאינו קובץ מדיה תקין.").first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("link", { name: "הורדת המקור" })).toHaveCount(4, { timeout: 90_000 });
  await shot(page, `${tag}-project`);

  // Previews really load: image decoded, video posters decoded
  const img = page.locator("img[alt='photo.jpg']");
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  const videos = page.locator("video");
  await expect(videos).toHaveCount(2);
  await expect(page.getByText("360×640")).toBeVisible(); // rotated iPhone video reported as portrait

  const project = (await (await page.request.get(`/api/projects/${projectId}`)).json()).project;
  const canH264 = await page.evaluate(() => document.createElement("video").canPlayType('video/mp4; codecs="avc1.64001F"') !== "");
  if (canH264) {
    for (const v of await videos.all()) {
      await expect.poll(() => v.evaluate((el: HTMLVideoElement) => el.readyState), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
    }
    const dims = await videos.evaluateAll((els) => els.map((e) => [(e as HTMLVideoElement).videoWidth, (e as HTMLVideoElement).videoHeight]));
    expect(dims).toContainEqual([1280, 720]);
    expect(dims).toContainEqual([360, 640]);
  } else {
    // Open-source Chromium ships without H.264/AAC (Safari/Chrome/Edge have them):
    // verify the served preview files themselves are valid H.264/AAC in the right orientation.
    const expected: Record<string, [number, number]> = { "dance.mp4": [1280, 720], "iphone.mov": [360, 640] };
    for (const [name, [w, h]] of Object.entries(expected)) {
      const a = project.assets.find((x: { originalName: string }) => x.originalName === name);
      const res = await page.request.get(`/api/assets/${a.id}/file?v=preview`);
      expect(res.headers()["content-type"]).toBe("video/mp4");
      const file = fx.f(`served-${name}.mp4`);
      fs.writeFileSync(file, await res.body());
      const r = analyzeProbe(await ffprobe(file), "VIDEO", mediaLimits({}));
      expect(r.ok && [r.meta.videoCodec, r.meta.audioCodec, r.meta.width, r.meta.height]).toEqual(["h264", "aac", w, h]);
      const poster = await page.request.get(`/api/assets/${a.id}/file?v=poster`);
      expect(poster.headers()["content-type"]).toBe("image/jpeg");
    }
  }

  // Byte-range support (required by iPhone Safari)
  const video = project.assets.find((a: { originalName: string }) => a.originalName === "dance.mp4");
  const ranged = await page.request.get(`/api/assets/${video.id}/file?v=preview`, { headers: { Range: "bytes=0-1" } });
  expect(ranged.status()).toBe(206);
  expect(ranged.headers()["content-range"]).toMatch(/^bytes 0-1\/\d+$/);
  const original = await page.request.get(`/api/assets/${video.id}/file?v=original&download=1`);
  expect(original.headers()["content-disposition"]).toContain("attachment");
  expect((await original.body()).length).toBe(video.sizeBytes);

  // Access control: another user sees nothing
  const other = await browser.newContext();
  await signIn(other.request, `e2e-${tag}-other@test.local`);
  expect((await other.request.get(`/api/projects/${projectId}`)).status()).toBe(404);
  expect((await other.request.get(`/api/assets/${video.id}/file?v=preview`)).status()).toBe(404);
  expect((await other.request.delete(`/api/projects/${projectId}`, { headers: { origin: new URL(page.url()).origin } })).status()).toBe(404);
  await other.close();

  // Edit
  await page.getByRole("button", { name: "עריכה" }).click();
  await page.getByLabel("שם הפרויקט").fill(`ריקוד חתונה ${tag} – גרסה 2`);
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByRole("heading", { name: `ריקוד חתונה ${tag} – גרסה 2` })).toBeVisible();
  await expect(page.getByText("פרטי הפרויקט עודכנו")).toBeVisible();

  // Duplicate: only READY files are copied, and they play immediately
  await page.getByRole("button", { name: "שכפול" }).click();
  await page.waitForURL((u) => !u.pathname.endsWith(projectId) && /\/projects\/[\w-]+$/.test(u.pathname));
  const copyId = page.url().split("/").pop()!;
  await expect(page.getByRole("heading", { name: /\(עותק\)$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "הורדת המקור" })).toHaveCount(4);
  await expect(page.getByText("הקובץ פגום")).toHaveCount(0);
  await expect.poll(() => page.locator("img[alt='photo.jpg']").evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  expect(await countObjects(`u/${me.id}/p/${copyId}/`)).not.toBe(0);

  // Delete one asset in the copy
  const audioCard = page.locator("div", { has: page.getByText("voice.mp3", { exact: true }) }).filter({ has: page.getByRole("button", { name: "מחיקה" }) }).last();
  await audioCard.getByRole("button", { name: "מחיקה" }).click();
  await page.getByRole("button", { name: "למחוק את הקובץ?" }).click();
  await expect(page.getByRole("link", { name: "הורדת המקור" })).toHaveCount(3);

  // Delete the copy: rows and stored objects are gone, original untouched
  await page.getByRole("button", { name: "מחיקה", exact: true }).first().click();
  await page.getByRole("button", { name: "למחוק את הפרויקט וכל הקבצים?" }).click();
  await page.waitForURL(/\/projects$/);
  expect((await page.request.get(`/api/projects/${copyId}`)).status()).toBe(404);
  const objectsLeft = await countObjects(`u/${me.id}/p/${copyId}/`);
  if (objectsLeft !== null) expect(objectsLeft).toBe(0);
  expect((await page.request.get(`/api/projects/${projectId}`)).status()).toBe(200);
  await shot(page, `${tag}-library`);

  // Clean up the original
  const del = await page.request.delete(`/api/projects/${projectId}`);
  expect(del.status()).toBe(200);
  const leftOriginal = await countObjects(`u/${me.id}/p/${projectId}/`);
  if (leftOriginal !== null) expect(leftOriginal).toBe(0);
});

test("upload API rejects bad input", async ({ page }, info) => {
  await signIn(page.request, `e2e-${info.project.name}@test.local`);
  const created = await page.request.post("/api/projects", { data: { name: "בדיקת שגיאות", aspectRatio: "9:16" } });
  const { id } = await created.json();
  const up = (name: string, body: Buffer, type: string) =>
    page.request.post(`/api/projects/${id}/assets`, { headers: { "X-File-Name": encodeURIComponent(name), "Content-Type": type }, data: body });

  const exe = await up("virus.exe", Buffer.from("MZ"), "application/octet-stream");
  expect(exe.status()).toBe(415);
  expect((await exe.json()).error).toContain("אינו נתמך");
  expect((await up("empty.jpg", Buffer.alloc(0), "image/jpeg")).status()).toBe(400);
  const big = await up("huge.jpg", Buffer.alloc(16 * 1024 * 1024), "image/jpeg");
  expect(big.status()).toBe(413);
  expect((await big.json()).error).toContain("גדולה מדי");
  expect((await page.request.post(`/api/projects/does-not-exist/assets`, { headers: { "X-File-Name": "a.jpg" }, data: Buffer.from("x") })).status()).toBe(404);
  const badName = await page.request.post("/api/projects", { data: { name: "", aspectRatio: "4:3" } });
  expect(badName.status()).toBe(400);
  await page.request.delete(`/api/projects/${id}`);
});
