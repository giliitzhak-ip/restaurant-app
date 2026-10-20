import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { facefusionInstalled, facefusionLocal } from "./facefusion-local";
import { faceDetectionAvailable, detectFaces } from "@/server/media/faces";
import { faceSamples, makeFaceVideos } from "@/test/faces";
import type { FaceSwapRequest } from "./types";

/**
 * FaceFusion's models can't be downloaded in CI, so this uses a stand-in
 * `facefusion.py` that records the CLI arguments, prints tqdm-style progress and
 * copies the target to the output. It verifies everything on our side of the CLI.
 */
const root = fs.mkdtempSync(path.join(os.tmpdir(), "sahar-ff-test-"));
const ffDir = path.join(root, "facefusion");
const argsFile = path.join(root, "args.json");

beforeAll(() => {
  fs.mkdirSync(path.join(ffDir, ".venv/bin"), { recursive: true });
  fs.symlinkSync(process.env.PYTHON3 || "/usr/bin/python3", path.join(ffDir, ".venv/bin/python"));
  fs.writeFileSync(
    path.join(ffDir, "facefusion.py"),
    `import json, shutil, sys
args = sys.argv[1:]
json.dump(args, open(${JSON.stringify(argsFile)}, "w"))
for p in (25, 50, 100):
    print(f"processing: {p}%|####| {p}/100", file=sys.stderr, flush=True)
shutil.copy(args[args.index("-t") + 1], args[args.index("-o") + 1])
`,
  );
  process.env.FACEFUSION_DIR = ffDir;
});
afterAll(() => {
  delete process.env.FACEFUSION_DIR;
  fs.rmSync(root, { recursive: true, force: true });
});

const args = () => JSON.parse(fs.readFileSync(argsFile, "utf8")) as string[];
const flag = (a: string[], f: string) => a[a.indexOf(f) + 1];

describe("FaceFusion local engine (stub CLI)", () => {
  it("reports installation and licence", () => {
    expect(facefusionInstalled()).toMatchObject({ ok: true });
    expect(facefusionInstalled().detail).toContain("Apache-2.0");
    expect(facefusionLocal.paid).toBe(false);
    expect(facefusionLocal.estimate({ durationSec: 10, width: 720, height: 1280, fps: 30, hasAudio: true }).costCents).toBe(0);
  });

  it("single person: runs headless-run in 'one' mode on the trimmed clip and reports progress", async (ctx) => {
    const s = await faceSamples();
    if (!s) ctx.skip();
    const v = makeFaceVideos(root, s!);
    const req: FaceSwapRequest = {
      jobId: `ff1-${Date.now()}`,
      sourceImage: { localPath: s!.b, mimeType: "image/jpeg", url: async () => "" },
      targetVideo: { localPath: v.one, mimeType: "video/mp4", url: async () => "" },
      video: { durationSec: 2, width: 480, height: 480, fps: 25, hasAudio: false },
      clip: { startSec: 0.5, endSec: 1.5, maxFps: 15 },
      target: null,
    };
    const progress: number[] = [];
    const { providerJobId } = await facefusionLocal.start(req, { onProgress: (p) => progress.push(p) });
    const a = args();
    expect(a[0]).toBe("headless-run");
    expect(flag(a, "--processors")).toBe("face_swapper");
    expect(flag(a, "--face-swapper-model")).toBe("ghost_1_256");
    expect(flag(a, "--face-selector-mode")).toBe("one");
    expect(flag(a, "--execution-providers")).toBe("cpu");
    expect(flag(a, "-s")).toBe(s!.b);
    expect(progress.at(-1)).toBe(1);
    const r = await facefusionLocal.poll(providerJobId, { onProgress: () => {} });
    expect(r.state).toBe("succeeded");
  }, 60_000);

  it("several people: selects the chosen person by reference frame and left-to-right position", async (ctx) => {
    const s = await faceSamples();
    if (!s || !faceDetectionAvailable().ok) ctx.skip();
    const v = makeFaceVideos(root, s!);
    // Our own detector on the clip gives the persons and thumbnails, as in the real pipeline.
    const work = fs.mkdtempSync(path.join(root, "det-"));
    const det = await detectFaces({ input: v.two, kind: "VIDEO", durationSec: 3, workDir: work, outDir: path.join(work, "out") });
    if (det.status !== "ok") throw new Error("detection failed");
    const right = [...det.persons].sort((x, y) => x.box.x - y.box.x)[1]!;
    const req: FaceSwapRequest = {
      jobId: `ff2-${Date.now()}`,
      sourceImage: { localPath: s!.a, mimeType: "image/jpeg", url: async () => "" },
      targetVideo: { localPath: v.two, mimeType: "video/mp4", url: async () => "" },
      video: { durationSec: 3, width: 920, height: 460, fps: 25, hasAudio: true },
      clip: { startSec: 0, endSec: 3, maxFps: 24 },
      target: {
        personIndex: right.index,
        box: right.box,
        timeSec: right.bestTime,
        personsInVideo: 2,
        thumb: { localPath: path.join(work, "out", right.thumb), mimeType: "image/jpeg", url: async () => "" },
      },
    };
    await facefusionLocal.start(req, { onProgress: () => {} });
    const a = args();
    expect(flag(a, "--face-selector-mode")).toBe("reference");
    expect(flag(a, "--face-selector-order")).toBe("left-right");
    expect(flag(a, "--reference-face-position")).toBe("1"); // the person on the right
    expect(Number(flag(a, "--reference-frame-number"))).toBeGreaterThanOrEqual(0);
  }, 90_000);
});
