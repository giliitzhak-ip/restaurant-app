import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import { makeFixtures } from "@/test/fixtures";
import { faceSamples } from "@/test/faces";
import { faceDetectionAvailable } from "@/server/media/faces";
import { analyzeProbe, ffprobe } from "@/server/media/probe";
import { mediaLimits } from "@/server/media/policy";
import { magicHourFaceSwap, magicHourFrames } from "./magichour";
import { mockFaceSwap } from "./mock";
import { checkLimits, clippedVideo, type FaceSwapRequest, type ProviderAccount, type VideoInfo } from "./types";
import { coveredByFreeCredits, jobBlockers, type BudgetStatus } from "@/server/billing";

const v30: VideoInfo = { durationSec: 30, width: 1080, height: 1920, fps: 30, hasAudio: true };
const budget = (over: Partial<BudgetStatus> = {}): BudgetStatus => ({
  monthlyBudgetCents: 1000, spentCents: 0, reservedCents: 0, availableCents: 1000, jobsToday: 0, dailyJobLimit: 20, ...over,
});

let fx: ReturnType<typeof makeFixtures>;
beforeAll(() => {
  fx = makeFixtures();
}, 60_000);
afterAll(() => fx.cleanup());

describe("cost estimates", () => {
  it("Magic Hour: 1 credit per frame, 60 fps capped to 30", () => {
    expect(magicHourFrames(v30)).toBe(900);
    expect(magicHourFrames({ ...v30, fps: 59.94 })).toBe(900);
    expect(magicHourFrames({ ...v30, fps: 24 })).toBe(720);
    const e = magicHourFaceSwap.estimate(v30);
    expect(e.costCents).toBe(225); // 900 × $0.0025
    expect(e.breakdown.find((b) => b.label === "קרדיטים")?.value).toBe("900");
  });
  it("mock is free", () => {
    expect(mockFaceSwap.estimate(v30).costCents).toBe(0);
  });
  it("checks provider limits", () => {
    expect(checkLimits(magicHourFaceSwap, { ...v30, durationSec: 400 }, 1000)[0]).toContain("ארוך מדי");
    expect(checkLimits(magicHourFaceSwap, v30, 1000)).toEqual([]);
  });
});

describe("clip options", () => {
  it("trims and caps fps, which lowers the Magic Hour credits", () => {
    const v = clippedVideo({ ...v30, fps: 60 }, { startSec: 5, endSec: 15, maxFps: 15 });
    expect(v).toMatchObject({ durationSec: 10, fps: 15 });
    expect(magicHourFaceSwap.estimate(v).credits).toBe(150);
    expect(clippedVideo(v30, { startSec: 25, endSec: 99, maxFps: 30 }).durationSec).toBe(5);
  });
});

describe("Free Mode", () => {
  const free: ProviderAccount = { credits: 400, tier: "free", subscription: null };
  const env = { MAGIC_HOUR_API_KEY: "k", FREE_MODE: "true", ALLOW_PAID_PROVIDERS: "true" };
  it("allows a paid provider only when free credits on a free account cover the job", () => {
    expect(coveredByFreeCredits(free, 390)).toEqual({ ok: true });
    expect(jobBlockers({ provider: magicHourFaceSwap, costCents: 0, budget: budget({ monthlyBudgetCents: 0, availableCents: 0 }), env, account: free, credits: 390 })).toEqual([]);
  });
  it("blocks when credits are short, the account is paid, or the balance is unknown", () => {
    expect(coveredByFreeCredits(free, 401).ok).toBe(false);
    expect(coveredByFreeCredits({ ...free, tier: "creator", subscription: "Creator" }, 10).ok).toBe(false);
    expect(coveredByFreeCredits({ ...free, subscription: "Pro" }, 10).ok).toBe(false); // tier lag during plan change
    expect(coveredByFreeCredits(null, 10).ok).toBe(false);
    const b = jobBlockers({ provider: magicHourFaceSwap, costCents: 0, budget: budget(), env, account: { ...free, credits: 100 }, credits: 390 });
    expect(b[0]).toContain("מצב חינמי פעיל");
  });
  it("ignores ALLOW_PAID_PROVIDERS and budgets: paid usage stays blocked", () => {
    const b = jobBlockers({ provider: magicHourFaceSwap, costCents: 225, budget: budget(), env, account: { credits: 100000, tier: "pro", subscription: "Pro" }, credits: 900 });
    expect(b.length).toBeGreaterThan(0);
  });
  it("lets free engines run with no budget", () => {
    expect(jobBlockers({ provider: mockFaceSwap, costCents: 0, budget: budget({ monthlyBudgetCents: 0, availableCents: 0 }), env: { FREE_MODE: "true" } })).toEqual([]);
  });
});

describe("billing guard (Free Mode off)", () => {
  const env = { MAGIC_HOUR_API_KEY: "k", ALLOW_PAID_PROVIDERS: "true", FREE_MODE: "false", S3_ENDPOINT: "https://acc.r2.cloudflarestorage.com" };
  it("allows a paid job only with key, global opt-in and enough budget", () => {
    expect(jobBlockers({ provider: magicHourFaceSwap, costCents: 225, budget: budget(), env })).toEqual([]);
  });
  it("blocks when paid providers are disabled or the key is missing", () => {
    const b = jobBlockers({ provider: magicHourFaceSwap, costCents: 225, budget: budget(), env: { FREE_MODE: "false", S3_ENDPOINT: env.S3_ENDPOINT } });
    expect(b.join(" ")).toContain("ALLOW_PAID_PROVIDERS");
    expect(b.join(" ")).toContain("חסר מפתח");
  });
  it("blocks over budget, without budget, over the per-job cap and over the daily limit", () => {
    expect(jobBlockers({ provider: magicHourFaceSwap, costCents: 225, budget: budget({ monthlyBudgetCents: 0, availableCents: 0 }), env })[0]).toContain("לא הוגדר תקציב");
    expect(jobBlockers({ provider: magicHourFaceSwap, costCents: 225, budget: budget({ availableCents: 100 }), env })[0]).toContain("גבוהה מהיתרה");
    expect(jobBlockers({ provider: magicHourFaceSwap, costCents: 2500, budget: budget({ availableCents: 5000 }), env }).join(" ")).toContain("התקרה");
    expect(jobBlockers({ provider: magicHourFaceSwap, costCents: 225, budget: budget({ jobsToday: 20 }), env })[0]).toContain("היומית");
  });
  it("never blocks the free mock on budget", () => {
    expect(jobBlockers({ provider: mockFaceSwap, costCents: 0, budget: budget({ monthlyBudgetCents: 0, availableCents: 0 }), env: {} })).toEqual([]);
  });
});

describe("mock provider", () => {
  it("renders a labelled test video that keeps the soundtrack", async () => {
    const req: FaceSwapRequest = {
      jobId: `t${Date.now()}`,
      sourceImage: { localPath: fx.f("photo.jpg"), mimeType: "image/jpeg", url: async () => "" },
      targetVideo: { localPath: fx.f("dance.mp4"), mimeType: "video/mp4", url: async () => "" },
      video: { durationSec: 2, width: 1280, height: 720, fps: 30, hasAudio: true },
      clip: { startSec: 0, endSec: 2, maxFps: 30 },
      target: { personIndex: 0, box: { x: 0.4, y: 0.2, w: 0.2, h: 0.3 }, timeSec: 0, personsInVideo: 1 },
    };
    const progress: number[] = [];
    const { providerJobId } = await mockFaceSwap.start(req, { onProgress: (p) => progress.push(p) });
    const r = await mockFaceSwap.poll(providerJobId, { onProgress: () => {} });
    expect(r.state).toBe("succeeded");
    if (r.state !== "succeeded" || r.output.kind !== "file") throw new Error("expected file");
    const a = analyzeProbe(await ffprobe(r.output.path), "VIDEO", mediaLimits({}));
    expect(a.ok && [a.meta.width, a.meta.height, a.meta.hasAudio]).toEqual([1280, 720, true]);
    expect(progress.length).toBeGreaterThan(0);
    fs.rmSync(r.output.path);
  });
});

/**
 * Contract test: a local fake of the Magic Hour API that answers with the response
 * examples from the official SDK docs, and records what our adapter sends.
 */
describe("Magic Hour adapter (contract test against a local fake)", () => {
  type Rec = { method: string; url: string; auth?: string; body?: unknown; bytes?: number };
  const calls: Rec[] = [];
  let server: http.Server;
  let base = "";
  let projectStatus = "queued";
  let faceFiles: string[] = [];
  let accountMode: "pro" | "free" = "free";

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const raw = Buffer.concat(chunks);
        const rec: Rec = { method: req.method!, url: req.url!, auth: req.headers.authorization };
        if (req.headers["content-type"] === "application/json") rec.body = JSON.parse(raw.toString() || "{}");
        else rec.bytes = raw.length;
        calls.push(rec);
        const json = (code: number, o: unknown) => {
          res.writeHead(code, { "Content-Type": "application/json" });
          res.end(JSON.stringify(o));
        };
        if (req.method === "POST" && req.url === "/v1/files/upload-urls") {
          const items = (rec.body as { items: { extension: string; type: string }[] }).items;
          return json(200, {
            items: items.map((it, i) => ({ expires_at: "2099-01-01T00:00:00Z", file_path: `api-assets/id/${i}.${it.extension}`, upload_url: `${base}/upload/${i}.${it.extension}?auth-value=1` })),
          });
        }
        if (req.method === "PUT" && req.url!.startsWith("/upload/")) return json(200, {});
        if (req.method === "POST" && req.url === "/v1/face-detection") return json(200, { credits_charged: 0, id: "det-1" });
        if (req.method === "GET" && req.url === "/v1/face-detection/det-1") {
          return json(200, { credits_charged: 0, id: "det-1", status: "complete", faces: faceFiles.map((_, i) => ({ path: `api-assets/id/0-${i}.png`, url: `${base}/faces/${i}.png` })) });
        }
        if (req.method === "GET" && req.url!.startsWith("/faces/")) {
          res.writeHead(200, { "Content-Type": "image/jpeg" });
          return res.end(fs.readFileSync(faceFiles[Number(req.url!.split("/")[2]!.split(".")[0])]!));
        }
        if (req.method === "POST" && req.url === "/v1/face-swap") return json(200, { id: "cuid-example", credits_charged: 450, estimated_frame_cost: 450 });
        if (req.method === "GET" && req.url === "/v1/account") {
          // Example response from the SDK docs (resources/v1/account/README.md), and a free account.
          return json(200, accountMode === "pro"
            ? { credits: 12500, email: "user@example.com", id: "cuid-example", subscription: { billing_interval: "month", cancel_at_period_end: false, current_period_end: "2026-10-01T00:00:00.000Z", name: "Pro", price: { amount: 4900, currency: "usd" }, status: "active" }, tier: "pro" }
            : { credits: 400, email: "user@example.com", id: "cuid-free", subscription: null, tier: "free" });
        }
        if (req.method === "GET" && req.url === "/v1/video-projects/cuid-example") {
          if (projectStatus === "error") return json(200, { id: "cuid-example", status: "error", error: { code: "no_source_face", message: "Please use an image with a detectable face" } });
          return json(200, {
            id: "cuid-example", status: projectStatus, credits_charged: 450, total_frame_cost: 450, fps: 30.0, width: 512, height: 960,
            downloads: projectStatus === "complete" ? [{ expires_at: "2099-01-01T00:00:00Z", url: `${base}/out.mp4` }] : [],
          });
        }
        json(404, { message: "not found" });
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.MAGIC_HOUR_BASE_URL = base;
    process.env.MAGIC_HOUR_API_KEY = "test-key";
  });
  afterAll(() => {
    server.close();
    delete process.env.MAGIC_HOUR_BASE_URL;
    delete process.env.MAGIC_HOUR_API_KEY;
  });

  const request = (target: FaceSwapRequest["target"]): FaceSwapRequest => ({
    jobId: "job-1",
    sourceImage: { localPath: fx.f("photo.jpg"), mimeType: "image/jpeg", url: async () => "" },
    targetVideo: { localPath: fx.f("dance.mp4"), mimeType: "video/mp4", url: async () => "" },
    video: { durationSec: 2, width: 1280, height: 720, fps: 30, hasAudio: true },
    clip: { startSec: 0, endSec: 2, maxFps: 30 },
    target,
  });

  it("single person: uploads both files, submits all-faces, polls to completion", async () => {
    calls.length = 0;
    const { providerJobId } = await magicHourFaceSwap.start(request(null), { onProgress: () => {} });
    expect(providerJobId).toBe("cuid-example");

    expect(calls.every((c) => c.url.startsWith("/upload/") || c.auth === "Bearer test-key")).toBe(true);
    const urls = calls.find((c) => c.url === "/v1/files/upload-urls")!;
    expect(urls.body).toEqual({ items: [{ extension: "mp4", type: "video" }, { extension: "jpg", type: "image" }] });
    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts).toHaveLength(2);
    expect(puts.every((p) => (p.bytes ?? 0) > 1000)).toBe(true);
    const swap = calls.find((c) => c.url === "/v1/face-swap")!;
    expect(swap.body).toMatchObject({
      start_seconds: 0,
      end_seconds: 2,
      style: { version: "default" },
      assets: { video_source: "file", video_file_path: "api-assets/id/0.mp4", face_swap_mode: "all-faces", image_file_path: "api-assets/id/1.jpg" },
    });
    expect(calls.some((c) => c.url === "/v1/face-detection")).toBe(false);

    projectStatus = "rendering";
    expect(await magicHourFaceSwap.poll(providerJobId, { onProgress: () => {} })).toEqual({ state: "running" });
    projectStatus = "complete";
    expect(await magicHourFaceSwap.poll(providerJobId, { onProgress: () => {} })).toEqual({
      state: "succeeded",
      output: { kind: "url", url: `${base}/out.mp4` },
      billedCents: 113, // 450 credits × $0.0025, rounded up
      billedCredits: 450,
    });
    projectStatus = "error";
    const failed = await magicHourFaceSwap.poll(providerJobId, { onProgress: () => {} });
    expect(failed).toMatchObject({ state: "failed", code: "no_source_face" });
  }, 60_000);

  it("several people: maps the chosen person to Magic Hour's own face id (individual-faces)", async (ctx) => {
    const samples = await faceSamples();
    if (!samples || !faceDetectionAvailable().ok || !fs.existsSync("ai/models/face_recognition_sface_2021dec.onnx")) ctx.skip();
    calls.length = 0;
    faceFiles = [samples!.a, samples!.b]; // provider's detected faces: [person A, person B]
    const req = request({
      personIndex: 1,
      box: { x: 0.6, y: 0.2, w: 0.1, h: 0.2 },
      timeSec: 0,
      personsInVideo: 2,
      thumb: { localPath: samples!.b, mimeType: "image/jpeg", url: async () => "" }, // user picked person B
    });
    await magicHourFaceSwap.start(req, { onProgress: () => {} });
    expect(calls.find((c) => c.url === "/v1/face-detection")?.body).toEqual({ assets: { target_file_path: "api-assets/id/0.mp4" }, confidence_score: 0.5 });
    expect((calls.find((c) => c.url === "/v1/face-swap")!.body as { assets: unknown }).assets).toEqual({
      video_source: "file",
      video_file_path: "api-assets/id/0.mp4",
      face_swap_mode: "individual-faces",
      face_mappings: [{ original_face: "api-assets/id/0-1.png", new_face: "api-assets/id/1.jpg" }],
    });
  }, 60_000);

  it("reads the credit balance and plan (GET /v1/account)", async () => {
    accountMode = "pro";
    expect(await magicHourFaceSwap.account!()).toEqual({ credits: 12500, tier: "pro", subscription: "Pro" });
    accountMode = "free";
    expect(await magicHourFaceSwap.account!()).toEqual({ credits: 400, tier: "free", subscription: null });
  });

  it("sends only the chosen clip (end_seconds = clip length)", async () => {
    calls.length = 0;
    await magicHourFaceSwap.start({ ...request(null), clip: { startSec: 0.5, endSec: 1.5, maxFps: 15 } }, { onProgress: () => {} });
    expect((calls.find((c) => c.url === "/v1/face-swap")!.body as { end_seconds: number }).end_seconds).toBe(1);
  }, 60_000);

  it("refuses to submit (and bill) when the chosen person can't be matched", async (ctx) => {
    const samples = await faceSamples();
    if (!samples || !fs.existsSync("ai/models/face_recognition_sface_2021dec.onnx")) ctx.skip();
    calls.length = 0;
    faceFiles = [samples!.a];
    const req = request({ personIndex: 1, box: { x: 0, y: 0, w: 0.1, h: 0.1 }, timeSec: 0, personsInVideo: 2, thumb: { localPath: samples!.b, mimeType: "image/jpeg", url: async () => "" } });
    await expect(magicHourFaceSwap.start(req, { onProgress: () => {} })).rejects.toThrow(/לא בוצע חיוב/);
    expect(calls.some((c) => c.url === "/v1/face-swap")).toBe(false);
  }, 60_000);
});
