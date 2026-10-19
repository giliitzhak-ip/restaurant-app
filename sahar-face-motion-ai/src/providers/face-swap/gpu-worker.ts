import { providerFetch } from "./http";
import type { FaceSwapProvider, PollResult } from "./types";

/**
 * Adapter for a future self-hosted GPU server (e.g. FaceFusion behind a small
 * FastAPI app on a CUDA machine). The HTTP contract is OURS, documented in
 * ARCHITECTURE.md §6, so any open model can be plugged in behind it:
 *
 *   POST {GPU_WORKER_URL}/v1/face-swap   Authorization: Bearer {GPU_WORKER_TOKEN}
 *        { source_url, target_url, target_face: { box, time_sec } | null }
 *        → { id }
 *   GET  {GPU_WORKER_URL}/v1/jobs/{id}
 *        → { status: "queued"|"running"|"succeeded"|"failed", progress?: 0..1, output_url?, error? }
 */
export const gpuWorkerFaceSwap: FaceSwapProvider = {
  id: "gpu-worker",
  displayName: "שרת GPU עצמאי",
  paid: false, // no per-use API fee; you pay for the GPU machine itself
  requiredEnv: ["GPU_WORKER_URL", "GPU_WORKER_TOKEN"],
  capabilities: {
    maxDurationSec: Number(process.env.GPU_WORKER_MAX_SECONDS) || 180,
    minDurationSec: 0.3,
    maxOutputShortSide: 1080,
    maxInputBytes: 500 * 1024 * 1024,
    faceSelection: "box",
    keepsAudio: true,
    needsPublicUrls: true,
  },
  notes: [
    "פועל על שרת GPU שלכם: אין חיוב לפי שימוש, אבל יש עלות לשרת עצמו.",
    "יש לוודא שלמודל ההחלפה שעל השרת יש רישיון לשימוש מסחרי (inswapper_128 אינו מורשה לכך).",
  ],

  estimate(video) {
    return {
      costCents: 0,
      basis: "שרת עצמאי: ללא חיוב לפי שימוש",
      breakdown: [{ label: "אורך", value: `${video.durationSec.toFixed(1)} שניות` }],
      source: "self-hosted",
      verifiedAt: "2026-10-19",
    };
  },

  async start(req) {
    const base = process.env.GPU_WORKER_URL!.replace(/\/+$/, "");
    const res = await providerFetch<{ id: string }>(`${base}/v1/face-swap`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GPU_WORKER_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        source_url: await req.sourceImage.url(),
        target_url: await req.targetVideo.url(),
        target_face: req.target ? { box: req.target.box, time_sec: req.target.timeSec } : null,
      }),
    });
    if (!res.id) throw new Error("GPU worker did not return a job id");
    return { providerJobId: res.id };
  },

  async poll(id): Promise<PollResult> {
    const base = process.env.GPU_WORKER_URL!.replace(/\/+$/, "");
    const r = await providerFetch<{ status: string; progress?: number; output_url?: string; error?: string }>(
      `${base}/v1/jobs/${encodeURIComponent(id)}`,
      { headers: { Authorization: `Bearer ${process.env.GPU_WORKER_TOKEN}` } },
    );
    if (r.status === "succeeded" && r.output_url) return { state: "succeeded", output: { kind: "url", url: r.output_url }, billedCents: 0 };
    if (r.status === "failed") return { state: "failed", message: r.error ?? "השרת דיווח על כישלון" };
    return { state: "running", progress: r.progress };
  },
};
