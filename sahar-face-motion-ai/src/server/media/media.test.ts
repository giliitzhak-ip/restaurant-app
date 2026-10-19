import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import { analyzeProbe, ffprobe } from "./probe";
import { classifyUpload, mediaLimits } from "./policy";
import { parseRange } from "./range";
import { imagePreviewArgs, posterArgs, runFfmpeg, videoPreviewArgs } from "./ffmpeg";
import { makeFixtures } from "@/test/fixtures";

const limits = mediaLimits({});
let fx: ReturnType<typeof makeFixtures>;

beforeAll(() => {
  fx = makeFixtures();
}, 60_000);
afterAll(() => fx.cleanup());

describe("classifyUpload", () => {
  it("classifies by extension, falling back to MIME", () => {
    expect(classifyUpload("Dance.MOV", "")).toMatchObject({ ok: true, kind: "VIDEO", mime: "video/quicktime", ext: "mov" });
    expect(classifyUpload("IMG_0001.HEIC", "image/heic")).toMatchObject({ ok: true, kind: "IMAGE", ext: "heic" });
    expect(classifyUpload("blob", "image/jpeg")).toMatchObject({ ok: true, kind: "IMAGE", ext: "jpg" });
    expect(classifyUpload("song.m4a", "audio/x-m4a")).toMatchObject({ ok: true, kind: "AUDIO" });
  });
  it("rejects unsupported types with a Hebrew message", () => {
    const r = classifyUpload("virus.exe", "application/octet-stream");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("אינו נתמך");
    expect(classifyUpload("page.html", "text/html").ok).toBe(false);
  });
});

describe("analyzeProbe (real FFprobe on generated media)", () => {
  it("reads a landscape MP4 with audio", async () => {
    const r = analyzeProbe(await ffprobe(fx.f("dance.mp4")), "VIDEO", limits);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.meta).toMatchObject({ width: 1280, height: 720, fps: 30, hasAudio: true, videoCodec: "h264", audioCodec: "aac" });
      expect(r.meta.durationMs).toBeGreaterThan(1900);
      expect(r.meta.durationMs).toBeLessThan(2200);
    }
  });

  it("swaps dimensions for an iPhone-style rotated HEVC MOV", async () => {
    const r = analyzeProbe(await ffprobe(fx.f("iphone.mov")), "VIDEO", limits);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.meta.videoCodec).toBe("hevc");
      expect([90, 270]).toContain(r.meta.rotation);
      expect(r.meta).toMatchObject({ width: 360, height: 640 });
    }
  });

  it("detects a video without audio", async () => {
    const r = analyzeProbe(await ffprobe(fx.f("silent.mp4")), "VIDEO", limits);
    expect(r.ok && r.meta.hasAudio).toBe(false);
  });

  it("rejects a text file disguised as MP4", async () => {
    const r = analyzeProbe(await ffprobe(fx.f("fake.mp4")), "VIDEO", limits);
    expect(r).toEqual({ ok: false, error: "הקובץ פגום או שאינו קובץ מדיה תקין." });
  });

  it("enforces the video duration limit", async () => {
    const r = analyzeProbe(await ffprobe(fx.f("dance.mp4")), "VIDEO", { ...limits, maxVideoSeconds: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("ארוך מדי");
  });

  it("validates images and rejects tiny ones", async () => {
    const jpg = analyzeProbe(await ffprobe(fx.f("photo.jpg")), "IMAGE", limits);
    expect(jpg).toMatchObject({ ok: true, meta: { width: 640, height: 480 } });
    expect(analyzeProbe(await ffprobe(fx.f("photo.png")), "IMAGE", limits).ok).toBe(true);
    const tiny = analyzeProbe(await ffprobe(fx.f("tiny.png")), "IMAGE", limits);
    expect(tiny.ok).toBe(false);
  });

  it("rejects kind mismatches", async () => {
    expect(analyzeProbe(await ffprobe(fx.f("voice.mp3")), "VIDEO", limits).ok).toBe(false);
    expect(analyzeProbe(await ffprobe(fx.f("dance.mp4")), "AUDIO", limits)).toMatchObject({ ok: false, error: expect.stringContaining("סרטון") });
    expect(analyzeProbe(await ffprobe(fx.f("dance.mp4")), "IMAGE", limits).ok).toBe(false);
  });

  it("reads audio", async () => {
    const mp3 = analyzeProbe(await ffprobe(fx.f("voice.mp3")), "AUDIO", limits);
    expect(mp3).toMatchObject({ ok: true, meta: { audioCodec: "mp3", hasAudio: true } });
    expect(analyzeProbe(await ffprobe(fx.f("voice.wav")), "AUDIO", limits).ok).toBe(true);
  });
});

describe("ffmpeg derivatives", () => {
  it("makes a Safari-friendly H.264 preview of a rotated HEVC video, with progress", async () => {
    const out = fx.f("preview.mp4");
    const seen: number[] = [];
    await runFfmpeg(videoPreviewArgs(fx.f("iphone.mov"), out, true), { durationSec: 1, onProgress: (p) => seen.push(p) });
    const r = analyzeProbe(await ffprobe(out), "VIDEO", limits);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.meta.videoCodec).toBe("h264");
      expect(r.meta.audioCodec).toBe("aac");
      expect(r.meta.width! < r.meta.height!).toBe(true); // rotation baked in: portrait
      expect(r.meta.width! % 2).toBe(0);
    }
    expect(seen.length).toBeGreaterThan(0);
    expect(Math.max(...seen)).toBeLessThanOrEqual(1);
  });

  it("caps the short side at 720 and keeps aspect", async () => {
    const out = fx.f("preview-big.mp4");
    await runFfmpeg(videoPreviewArgs(fx.f("dance.mp4"), out, true));
    const r = analyzeProbe(await ffprobe(out), "VIDEO", limits);
    expect(r.ok && [r.meta.width, r.meta.height]).toEqual([1280, 720]);
  });

  it("makes posters and image previews", async () => {
    await runFfmpeg(posterArgs(fx.f("dance.mp4"), fx.f("poster.jpg"), 1));
    await runFfmpeg(imagePreviewArgs(fx.f("photo.jpg"), fx.f("thumb.jpg"), 320));
    expect(fs.statSync(fx.f("poster.jpg")).size).toBeGreaterThan(1000);
    const thumb = analyzeProbe(await ffprobe(fx.f("thumb.jpg")), "IMAGE", limits);
    expect(thumb).toMatchObject({ ok: true, meta: { width: 320, height: 240 } });
  });

  it("fails clearly on undecodable input", async () => {
    await expect(runFfmpeg(posterArgs(fx.f("fake.mp4"), fx.f("x.jpg"), 0))).rejects.toThrow(/ffmpeg failed/);
  });
});

describe("parseRange", () => {
  it("handles the Range forms Safari sends", () => {
    expect(parseRange("bytes=0-1", 100)).toEqual({ start: 0, end: 1 });
    expect(parseRange("bytes=10-", 100)).toEqual({ start: 10, end: 99 });
    expect(parseRange("bytes=-20", 100)).toEqual({ start: 80, end: 99 });
    expect(parseRange("bytes=50-500", 100)).toEqual({ start: 50, end: 99 });
  });
  it("rejects unsatisfiable ranges", () => {
    expect(parseRange("bytes=100-", 100)).toBe("invalid");
    expect(parseRange("bytes=5-2", 100)).toBe("invalid");
    expect(parseRange("items=0-1", 100)).toBe("invalid");
    expect(parseRange("bytes=0-1,5-6", 100)).toBeNull();
  });
});
