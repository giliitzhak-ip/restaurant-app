import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { runFfmpeg } from "./ffmpeg";

const run = promisify(execFile);

export type DetectedPerson = {
  index: number;
  thumb: string; // file name inside the asset's faces/ folder
  bestTime: number;
  box: { x: number; y: number; w: number; h: number }; // normalised 0..1, at bestTime
  score: number;
  framesSeen: number;
  presence: number; // share of sampled frames the person appears in
  times: number[];
};

export type FacesResult =
  | { status: "ok"; detector: string; framesAnalyzed: number; persons: DetectedPerson[] }
  | { status: "unavailable"; reason: string }
  | { status: "error"; reason: string };

function modelsDir() {
  return path.resolve(process.env.FACE_MODELS_DIR || "ai/models");
}

function pythonBin() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const venv = path.resolve(".venv/bin/python");
  return existsSync(venv) ? venv : "python3";
}

const YUNET = "face_detection_yunet_2023mar.onnx";
const SFACE = "face_recognition_sface_2021dec.onnx";

export function faceDetectionAvailable(): { ok: boolean; detail: string } {
  if (!existsSync(path.join(modelsDir(), YUNET))) return { ok: false, detail: "מודל זיהוי הפנים חסר (npm run models:download)" };
  return { ok: true, detail: existsSync(path.join(modelsDir(), SFACE)) ? "YuNet + SFace" : "YuNet (ללא זיהוי זהות בין פריימים)" };
}

/**
 * Detects distinct people. For video, samples up to 16 frames from the
 * (rotation-corrected) preview; thumbnails are written into `outDir`.
 */
export async function detectFaces(opts: {
  input: string;
  kind: "VIDEO" | "IMAGE";
  durationSec?: number | null;
  workDir: string;
  outDir: string;
  maxPersons?: number;
}): Promise<FacesResult> {
  const avail = faceDetectionAvailable();
  if (!avail.ok) return { status: "unavailable", reason: avail.detail };

  const args = [path.resolve("ai/face_detect.py"), "--out", opts.outDir, "--yunet", path.join(modelsDir(), YUNET)];
  if (existsSync(path.join(modelsDir(), SFACE))) args.push("--sface", path.join(modelsDir(), SFACE));

  if (opts.kind === "VIDEO") {
    const dur = Math.max(0.5, opts.durationSec ?? 1);
    const count = Math.min(16, Math.max(4, Math.ceil(dur * 2)));
    const fps = count / dur;
    const framesDir = path.join(opts.workDir, "frames");
    await fs.mkdir(framesDir, { recursive: true });
    await runFfmpeg(["-i", opts.input, "-vf", `fps=${fps.toFixed(4)}`, "-frames:v", String(count), "-q:v", "3", path.join(framesDir, "%03d.jpg")], {
      timeoutMs: 120_000,
    });
    // Rename to "<seconds>.jpg" so the detector knows when each frame is.
    const files = (await fs.readdir(framesDir)).filter((f) => f.endsWith(".jpg")).sort();
    for (let i = 0; i < files.length; i++) {
      await fs.rename(path.join(framesDir, files[i]!), path.join(framesDir, `${(i / fps).toFixed(2).padStart(7, "0")}.jpg`));
    }
    args.push("--frames", framesDir);
  } else {
    args.push("--image", opts.input, "--max-persons", String(opts.maxPersons ?? 4));
  }

  try {
    const { stdout } = await run(pythonBin(), ["-I", ...args], { timeout: 180_000, maxBuffer: 5 * 1024 * 1024 });
    const parsed = JSON.parse(stdout) as { detector: string; framesAnalyzed: number; persons: DetectedPerson[]; error?: string };
    if (parsed.error) return { status: "error", reason: parsed.error };
    return { status: "ok", detector: parsed.detector, framesAnalyzed: parsed.framesAnalyzed, persons: parsed.persons };
  } catch (e) {
    const msg = (e as Error).message;
    if (/ENOENT|No module named/.test(msg)) return { status: "unavailable", reason: "סביבת Python/OpenCV לזיהוי פנים לא מותקנת" };
    return { status: "error", reason: msg.slice(0, 300) };
  }
}

/** Which candidate image shows the same person as `reference` (SFace). Null when none is confident. */
export async function matchFace(reference: string, candidates: string[]): Promise<{ best: number | null; scores: (number | null)[] }> {
  const sface = path.join(modelsDir(), SFACE);
  if (!existsSync(sface)) throw new Error("SFace model missing: run npm run models:download");
  const { stdout } = await run(
    pythonBin(),
    ["-I", path.resolve("ai/face_match.py"), "--reference", reference, "--candidates", ...candidates, "--yunet", path.join(modelsDir(), YUNET), "--sface", sface],
    { timeout: 120_000 },
  );
  return JSON.parse(stdout);
}
