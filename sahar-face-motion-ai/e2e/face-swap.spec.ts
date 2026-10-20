import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { faceSamples, makeFaceVideos } from "../src/test/faces";
import { shot, signIn } from "./helpers";

let files: { face: string; two: string } | null = null;
let dir = "";

test.beforeAll(async () => {
  const s = await faceSamples();
  if (!s) return;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "sahar-e2e-faces-"));
  const v = makeFaceVideos(dir, s);
  const face = path.join(dir, "my-face.jpg");
  fs.copyFileSync(s.b, face);
  files = { face, two: v.two };
});
test.afterAll(() => dir && fs.rmSync(dir, { recursive: true, force: true }));

test("face swap: upload, pick person, consent, quote, explicit approval, job tracking, before/after", async ({ page, browser }, info) => {
  test.skip(!files, "face sample images unavailable (offline)");
  const tag = info.project.name;
  await signIn(page.request, `e2e-fs-${tag}@test.local`);
  for (const p of (await (await page.request.get("/api/projects")).json()).projects) await page.request.delete(`/api/projects/${p.id}`);
  const { id: projectId } = await (await page.request.post("/api/projects", { data: { name: `החלפת פנים ${tag}`, aspectRatio: "16:9" } })).json();

  await page.goto(`/projects/${projectId}/face-swap`);
  await expect(page.getByRole("heading", { name: /AI Face Swap/ })).toBeVisible();

  // Free Mode is on; engines that can't run here are shown as unavailable, never faked.
  await expect(page.getByRole("link", { name: "מצב חינמי" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Mock/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /Magic Hour/ })).toBeDisabled();
  await expect(page.getByText("לא זמין: חסר מפתח API בשרת")).toBeVisible();

  // 1–2. Upload the face photo and the dance video in their steps
  const inputs = page.locator("input[type=file]");
  await inputs.nth(0).setInputFiles(files!.face);
  await inputs.nth(1).setInputFiles(files!.two);
  const pickFace = page.getByRole("button", { name: "בחירת my-face.jpg" });
  const pickVideo = page.getByRole("button", { name: "בחירת two-dancers.mp4" });
  await expect(pickFace.locator("img")).toBeVisible({ timeout: 90_000 });
  await expect(pickVideo.locator("img")).toBeVisible({ timeout: 90_000 });
  await pickFace.click();
  await pickVideo.click();

  // 3. The detector found both people; pick the second one
  await expect(page.getByText("זוהו 2 אנשים. בחרו את מי להחליף:")).toBeVisible();
  await page.getByRole("button", { name: "אדם 2" }).click();
  await expect(page.getByRole("button", { name: "אדם 2" })).toHaveAttribute("aria-pressed", "true");

  // 4. Consent: quote button stays disabled until everything is confirmed
  const quoteBtn = page.getByRole("button", { name: "קבלת הערכת עלות" });
  await expect(quoteBtn).toBeDisabled();
  await page.getByRole("radio", { name: "שלי", exact: true }).check();
  await page.getByLabel("שם האדם שבתמונה").fill("סהר בדיקה");
  for (const cb of await page.locator("fieldset ~ label input[type=checkbox]").all()) await cb.check();
  await page.getByText("15 fps", { exact: false }).click();
  await shot(page, `${tag}-faceswap-setup`);

  // 5. Quote → explicit approval
  await quoteBtn.click();
  await expect(page.getByText("עלות משוערת")).toBeVisible();
  await expect(page.getByText("$0.00").first()).toBeVisible();
  const approveBtn = page.getByRole("button", { name: "אישור ויצירה" });
  await expect(approveBtn).toBeDisabled();
  await shot(page, `${tag}-faceswap-quote`);
  await page.getByLabel("אני מאשר/ת את הפעלת המשימה (ללא עלות).").check();
  await approveBtn.click();

  // Job tracking → result with before/after
  await expect(page.getByText("הושלם").first()).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole("tab", { name: "השוואה" })).toBeVisible({ timeout: 90_000 });
  await page.getByRole("tab", { name: "השוואה" }).click();
  await expect(page.getByRole("button", { name: "ניגון שניהם יחד" })).toBeVisible();
  await shot(page, `${tag}-faceswap-result`);

  // The result: AI-labelled asset, AI metadata in the file, original audio kept
  const project = (await (await page.request.get(`/api/projects/${projectId}`)).json()).project;
  const job = project.aiJobs.find((j: { status: string }) => j.status === "SUCCEEDED");
  expect(job.input.personIndex).toBe(1);
  expect(job.input.clip).toMatchObject({ startSec: 0, maxFps: 15 });
  expect(job.approvedCostCents).toBe(0);
  const result = project.assets.find((a: { id: string }) => a.id === job.resultAssetId);
  expect(result).toMatchObject({ role: "GENERATED", aiGenerated: true, status: "READY", kind: "VIDEO" });
  const dl = await page.request.get(`/api/assets/${result.id}/file?v=original&download=1`);
  const out = path.join(dir, "result.mp4");
  fs.writeFileSync(out, await dl.body());
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", out]).toString());
  expect(probe.format.tags.comment).toMatch(/AI-generated/);
  expect(probe.streams.some((s: { codec_type: string }) => s.codec_type === "audio")).toBe(true);
  expect(project.events.some((e: { type: string }) => e.type === "faceswap.succeeded")).toBe(true);

  // Approval guards
  const origin = new URL(page.url()).origin;
  const quote = async () =>
    page.request.post("/api/face-swap/quote", {
      headers: { origin },
      data: {
        projectId,
        sourceAssetId: job.input.sourceAssetId,
        targetAssetId: job.input.targetAssetId,
        personIndex: 0,
        consent: { faceOwner: "SELF", subjectName: "סהר", confirmFace: true, confirmVideo: true, confirmLabel: true },
      },
    });
  const q = await (await quote()).json();
  expect(q.job.status).toBe("PENDING_APPROVAL");
  const wrong = await page.request.post(`/api/jobs/${q.job.id}/approve`, { headers: { origin }, data: { confirmCostCents: 999, acceptCharge: true } });
  expect(wrong.status()).toBe(409);
  const noAccept = await page.request.post(`/api/jobs/${q.job.id}/approve`, { headers: { origin }, data: { confirmCostCents: 0 } });
  expect(noAccept.status()).toBe(400);
  const other = await browser.newContext();
  await signIn(other.request, `e2e-fs-${tag}-other@test.local`);
  expect((await other.request.post(`/api/jobs/${q.job.id}/approve`, { headers: { origin }, data: { confirmCostCents: 0, acceptCharge: true } })).status()).toBe(404);
  await other.close();
  expect((await page.request.post(`/api/jobs/${q.job.id}/cancel`, { headers: { origin } })).status()).toBe(200);
  expect((await page.request.post(`/api/jobs/${q.job.id}/approve`, { headers: { origin }, data: { confirmCostCents: 0, acceptCharge: true } })).status()).toBe(409);

  // A paid engine without a key can't even be quoted
  const paid = await page.request.post("/api/face-swap/quote", {
    headers: { origin },
    data: { projectId, sourceAssetId: job.input.sourceAssetId, targetAssetId: job.input.targetAssetId, personIndex: 0, providerId: "magichour", consent: { faceOwner: "SELF", subjectName: "סהר", confirmFace: true, confirmVideo: true, confirmLabel: true } },
  });
  expect(paid.status()).toBe(503);
  const unknown = await page.request.post("/api/face-swap/quote", {
    headers: { origin },
    data: { projectId, sourceAssetId: job.input.sourceAssetId, targetAssetId: job.input.targetAssetId, personIndex: 0, providerId: "gpu-worker", consent: { faceOwner: "SELF", subjectName: "סהר", confirmFace: true, confirmVideo: true, confirmLabel: true } },
  });
  expect(unknown.status()).toBe(400); // not in FACE_SWAP_PROVIDERS

  const noConsent = await page.request.post("/api/face-swap/quote", {
    headers: { origin },
    data: { projectId, sourceAssetId: job.input.sourceAssetId, targetAssetId: job.input.targetAssetId, personIndex: 0, consent: { faceOwner: "SELF", subjectName: "ס", confirmFace: true, confirmVideo: false, confirmLabel: true } },
  });
  expect(noConsent.status()).toBe(400);

  await page.request.delete(`/api/projects/${projectId}`);
});
