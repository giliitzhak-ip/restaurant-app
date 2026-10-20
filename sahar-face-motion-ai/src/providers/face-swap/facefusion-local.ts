import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runFfmpeg } from "@/server/media/ffmpeg";
import { detectFaces, matchFace } from "@/server/media/faces";
import type { FaceSwapProvider, PollResult } from "./types";

/**
 * Open-source, free engine: FaceFusion (github.com/facefusion/facefusion, code
 * licence OpenRAIL-AS) run locally on the worker's CPU (or GPU if present).
 * CLI flags are taken from facefusion/program.py (v3.9.x):
 *   python facefusion.py headless-run -s FACE -t VIDEO -o OUT --processors face_swapper
 *     --face-swapper-model MODEL --face-selector-mode one|reference [--face-selector-order left-right
 *     --reference-frame-number N --reference-face-position P] --execution-providers cpu
 *     --execution-thread-count T --download-providers github
 * Installed by scripts/setup-facefusion.sh.
 */

// Swapper model licences, from FaceFusion's face_swapper/core.py metadata.
export const FACEFUSION_MODELS: Record<string, { license: string; commercial: boolean }> = {
  ghost_1_256: { license: "Apache-2.0", commercial: true },
  ghost_2_256: { license: "Apache-2.0", commercial: true },
  ghost_3_256: { license: "Apache-2.0", commercial: true },
  hyperswap_1a_256: { license: "ResearchRAIL", commercial: false },
  hyperswap_1b_256: { license: "ResearchRAIL", commercial: false },
  hyperswap_1c_256: { license: "ResearchRAIL", commercial: false },
  inswapper_128: { license: "Non-Commercial", commercial: false },
  inswapper_128_fp16: { license: "Non-Commercial", commercial: false },
  simswap_256: { license: "Non-Commercial", commercial: false },
  blendswap_256: { license: "Non-Commercial", commercial: false },
};

const dir = () => path.resolve(process.env.FACEFUSION_DIR || ".facefusion");
const python = () => process.env.FACEFUSION_PYTHON || path.join(dir(), ".venv/bin/python");
const model = () => process.env.FACEFUSION_MODEL || "ghost_1_256";
const outputs = path.join(os.tmpdir(), "sahar-facefusion-out");

export function facefusionInstalled(): { ok: boolean; detail: string } {
  if (!existsSync(path.join(dir(), "facefusion.py"))) return { ok: false, detail: "FaceFusion לא מותקן (scripts/setup-facefusion.sh)" };
  if (!existsSync(python())) return { ok: false, detail: "סביבת Python של FaceFusion חסרה" };
  const m = FACEFUSION_MODELS[model()];
  return { ok: true, detail: `FaceFusion · ${model()} (${m?.license ?? "רישיון לא ידוע"})` };
}

/** Runs FaceFusion and reports progress parsed from its tqdm output ("…| 45%|…"). */
function runFacefusion(args: string[], onProgress: (f: number) => void, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(python(), ["facefusion.py", ...args], { cwd: dir(), stdio: ["ignore", "pipe", "pipe"] });
    let tail = "";
    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      tail = (tail + text).slice(-3000);
      const all = [...text.matchAll(/(\d{1,3})%\|/g)];
      const last = all.at(-1);
      if (last) onProgress(Math.min(1, Number(last[1]) / 100));
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
    proc.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`FaceFusion failed (${code}): ${tail.split("\n").filter(Boolean).slice(-4).join(" | ")}`));
    });
  });
}

export const facefusionLocal: FaceSwapProvider = {
  id: "facefusion-local",
  displayName: "FaceFusion (קוד פתוח, חינמי)",
  paid: false,
  requiredEnv: [],
  capabilities: {
    maxDurationSec: Number(process.env.FACEFUSION_MAX_SECONDS) || 60,
    minDurationSec: 1,
    maxOutputShortSide: 1080,
    maxInputBytes: 500 * 1024 * 1024,
    faceSelection: "reference-image",
    keepsAudio: true,
    needsPublicUrls: false,
  },
  get notes() {
    const m = FACEFUSION_MODELS[model()];
    return [
      "מנוע קוד פתוח שרץ על השרת שלכם: ללא עלות לשימוש וללא מגבלת קרדיטים.",
      `מודל: ${model()} · רישיון ${m?.license ?? "לא ידוע"}${m && !m.commercial ? " (לשימוש אישי/מחקרי בלבד, לא מסחרי)" : m?.commercial ? " (מותר לשימוש מסחרי)" : ""}.`,
      "על מעבד (CPU) העיבוד איטי: בערך 3–10 דקות לכל 10 שניות וידאו. קטע קצר ו-15/24fps מקצרים את ההמתנה.",
    ];
  },

  available: facefusionInstalled,

  estimate(video) {
    const minutes = Math.max(1, Math.round((video.durationSec * (video.fps ?? 30)) / 60 / 1.0)); // ~1 fps on 2 vCPU
    return {
      costCents: 0,
      basis: "מנוע מקומי בקוד פתוח, ללא עלות",
      breakdown: [
        { label: "אורך", value: `${video.durationSec.toFixed(1)} שניות` },
        { label: "זמן עיבוד משוער (CPU)", value: `עד כ-${minutes} דקות` },
        { label: "עלות", value: "$0.00" },
      ],
      source: "local",
      verifiedAt: "2026-10-20",
    };
  },

  async start(req, ctx) {
    const inst = facefusionInstalled();
    if (!inst.ok) throw new Error(inst.detail);
    await fs.mkdir(outputs, { recursive: true });
    const work = await fs.mkdtemp(path.join(os.tmpdir(), "sahar-ff-"));
    const out = path.join(outputs, `${req.jobId}.mp4`);
    const clipDur = Math.max(0.1, req.clip.endSec - req.clip.startSec);
    try {
      // 1. The clip to process: trimmed, fps-capped, H.264 (FaceFusion reads it with FFmpeg).
      const clip = path.join(work, "clip.mp4");
      await runFfmpeg(
        ["-ss", req.clip.startSec.toFixed(3), "-t", clipDur.toFixed(3), "-i", req.targetVideo.localPath, "-map", "0:v:0", "-map", "0:a:0?",
          "-fpsmax", String(req.clip.maxFps), "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", "-c:a", "aac", clip],
        { durationSec: clipDur, onProgress: (f) => ctx.onProgress(f * 0.05) },
      );

      // 2. Which face: one person → "one"; several and a choice → "reference" (frame + left-to-right position).
      let selector = ["--face-selector-mode", "one", "--face-selector-order", "large-small"];
      if (req.target && req.target.personsInVideo > 1 && req.target.thumb) {
        const t = req.target.timeSec >= req.clip.startSec && req.target.timeSec <= req.clip.endSec ? req.target.timeSec - req.clip.startSec : clipDur / 2;
        const fps = Math.min(req.clip.maxFps, req.video.fps ?? 30);
        const frame = path.join(work, "ref.jpg");
        await runFfmpeg(["-ss", t.toFixed(3), "-i", clip, "-frames:v", "1", "-q:v", "2", frame]);
        const faces = await detectFaces({ input: frame, kind: "IMAGE", workDir: work, outDir: path.join(work, "ref"), maxPersons: 12 });
        if (faces.status !== "ok" || faces.persons.length === 0) throw new Error("לא נמצאו פנים בפריים הייחוס של הקטע. בחרו קטע שבו האדם נראה.");
        const match = await matchFace(req.target.thumb.localPath, faces.persons.map((p) => path.join(work, "ref", p.thumb)));
        if (match.best === null) throw new Error("האדם שנבחר לא זוהה בקטע שנבחר. בחרו קטע אחר.");
        const leftToRight = [...faces.persons].sort((a, b) => a.box.x - b.box.x);
        const position = leftToRight.findIndex((p) => p.index === faces.persons[match.best!]!.index);
        selector = [
          "--face-selector-mode", "reference", "--face-selector-order", "left-right",
          "--reference-frame-number", String(Math.round(t * fps)), "--reference-face-position", String(position),
        ];
      }

      // 3. Run FaceFusion.
      await runFacefusion(
        [
          "headless-run",
          "-s", req.sourceImage.localPath, "-t", clip, "-o", out,
          "--processors", "face_swapper", "--face-swapper-model", model(),
          ...selector,
          "--execution-providers", process.env.FACEFUSION_EXECUTION_PROVIDER || "cpu",
          "--execution-thread-count", String(Number(process.env.FACEFUSION_THREADS) || Math.max(1, os.cpus().length)),
          "--download-providers", "github",
          "--temp-path", work,
          "--log-level", "info",
        ],
        (f) => ctx.onProgress(0.05 + f * 0.95),
        Number(process.env.FACEFUSION_TIMEOUT_MIN || 120) * 60_000,
      );
      if (!existsSync(out)) throw new Error("FaceFusion finished without an output file");
      return { providerJobId: `ff-${req.jobId}` };
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  },

  async poll(providerJobId): Promise<PollResult> {
    const file = path.join(outputs, `${providerJobId.replace(/^ff-/, "")}.mp4`);
    return existsSync(file)
      ? { state: "succeeded", output: { kind: "file", path: file }, billedCents: 0 }
      : { state: "failed", message: "קובץ התוצאה של FaceFusion לא נמצא", code: "FF_OUTPUT_MISSING" };
  },
};
