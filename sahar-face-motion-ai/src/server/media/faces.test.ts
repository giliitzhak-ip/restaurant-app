import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectFaces, faceDetectionAvailable, matchFace } from "./faces";
import { faceSamples, makeFaceVideos } from "@/test/faces";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sahar-faces-test-"));
let samples: Awaited<ReturnType<typeof faceSamples>> = null;
let videos: ReturnType<typeof makeFaceVideos> | null = null;

beforeAll(async () => {
  samples = await faceSamples();
  if (samples) videos = makeFaceVideos(dir, samples);
}, 60_000);
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe.runIf(faceDetectionAvailable().ok)("face detection (YuNet + SFace)", () => {
  it("finds two distinct people across the frames of a moving clip", async (ctx) => {
    if (!videos) ctx.skip();
    const work = fs.mkdtempSync(path.join(dir, "w-"));
    const r = await detectFaces({ input: videos!.two, kind: "VIDEO", durationSec: 3, workDir: work, outDir: path.join(work, "out") });
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.detector).toBe("yunet+sface");
    expect(r.persons).toHaveLength(2);
    for (const p of r.persons) {
      expect(p.presence).toBeGreaterThan(0.8); // tracked as the same person in (almost) every frame
      expect(fs.existsSync(path.join(work, "out", p.thumb))).toBe(true);
      expect(p.box.w).toBeGreaterThan(0);
      expect(p.box.x + p.box.w).toBeLessThanOrEqual(1.01);
    }
    // Left person is A, right person is B.
    const [left, right] = [...r.persons].sort((x, y) => x.box.x - y.box.x);
    expect(left!.box.x).toBeLessThan(0.5);
    expect(right!.box.x).toBeGreaterThan(0.5);
  }, 60_000);

  it("finds the face in a photo", async (ctx) => {
    if (!samples) ctx.skip();
    const work = fs.mkdtempSync(path.join(dir, "i-"));
    const r = await detectFaces({ input: samples!.a, kind: "IMAGE", workDir: work, outDir: path.join(work, "out") });
    expect(r.status === "ok" && r.persons.length).toBe(1);
  });

  it("matches a person across different crops, and rejects strangers", async (ctx) => {
    if (!samples) ctx.skip();
    const m = await matchFace(samples!.b, [samples!.a, samples!.b]);
    expect(m.best).toBe(1);
    const none = await matchFace(samples!.b, [samples!.a]);
    expect(none.best).toBeNull();
  });
});
