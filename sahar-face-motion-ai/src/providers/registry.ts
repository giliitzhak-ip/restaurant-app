import type { ModuleKey, ProviderInfo } from "./types";

/**
 * Catalogue of known providers per module. Only "mock" has an implementation in
 * phase 1; the rest are listed so the status page can show exactly what is
 * missing. Real adapters are added in their phases (see IMPLEMENTATION_PLAN.md).
 */
export const PROVIDER_CATALOG: Record<ModuleKey, ProviderInfo[]> = {
  faceSwap: [
    { id: "mock", displayName: "Mock (בדיקות)", paid: false, requiredEnv: [] },
    { id: "magichour", displayName: "Magic Hour", paid: true, requiredEnv: ["MAGIC_HOUR_API_KEY"] },
    { id: "akool", displayName: "Akool Face Swap Plus", paid: true, requiredEnv: ["AKOOL_API_KEY"] },
    { id: "gpu-worker", displayName: "GPU Worker עצמאי (FaceFusion)", paid: false, requiredEnv: ["GPU_WORKER_URL", "GPU_WORKER_TOKEN"] },
  ],
  motion: [
    { id: "mock", displayName: "Mock (בדיקות)", paid: false, requiredEnv: [] },
    { id: "runway", displayName: "Runway Act-Two", paid: true, requiredEnv: ["RUNWAYML_API_SECRET"] },
    { id: "fal", displayName: "fal.ai — Wan 2.2 Animate", paid: true, requiredEnv: ["FAL_KEY"] },
  ],
  voice: [
    { id: "mock", displayName: "Mock (בדיקות)", paid: false, requiredEnv: [] },
    { id: "elevenlabs", displayName: "ElevenLabs", paid: true, requiredEnv: ["ELEVENLABS_API_KEY"] },
    { id: "resemble", displayName: "Resemble AI", paid: true, requiredEnv: ["RESEMBLE_API_KEY"] },
  ],
  lipSync: [
    { id: "mock", displayName: "Mock (בדיקות)", paid: false, requiredEnv: [] },
    { id: "sync", displayName: "Sync Labs (sync.so)", paid: true, requiredEnv: ["SYNC_API_KEY"] },
    { id: "fal", displayName: "fal.ai", paid: true, requiredEnv: ["FAL_KEY"] },
  ],
};

const SELECTOR_ENV: Record<ModuleKey, string> = {
  faceSwap: "FACE_SWAP_PROVIDER",
  motion: "MOTION_PROVIDER",
  voice: "VOICE_PROVIDER",
  lipSync: "LIPSYNC_PROVIDER",
};

/** Adapters that actually exist in code. Grows phase by phase. */
const IMPLEMENTED = new Set<string>(["faceSwap:mock", "faceSwap:magichour", "faceSwap:gpu-worker", "motion:mock", "voice:mock", "lipSync:mock"]);

export type ProviderStatus = {
  module: ModuleKey;
  selectedId: string;
  displayName: string;
  implemented: boolean;
  configured: boolean;
  missingEnv: string[];
  paid: boolean;
  paidAllowed: boolean;
  /** Ready to run real jobs right now. */
  ready: boolean;
  isMock: boolean;
};

export function providerStatus(module: ModuleKey, env: Record<string, string | undefined> = process.env): ProviderStatus {
  const selectedId = (env[SELECTOR_ENV[module]] || "mock").trim();
  const info = PROVIDER_CATALOG[module].find((p) => p.id === selectedId);
  const paidAllowed = env.ALLOW_PAID_PROVIDERS === "true";
  if (!info) {
    return {
      module, selectedId, displayName: `לא מוכר: ${selectedId}`, implemented: false, configured: false,
      missingEnv: [], paid: false, paidAllowed, ready: false, isMock: false,
    };
  }
  const missingEnv = info.requiredEnv.filter((k) => !env[k]);
  const implemented = IMPLEMENTED.has(`${module}:${info.id}`);
  const configured = missingEnv.length === 0;
  return {
    module, selectedId, displayName: info.displayName, implemented, configured, missingEnv,
    paid: info.paid, paidAllowed, isMock: info.id === "mock",
    ready: implemented && configured && (!info.paid || paidAllowed),
  };
}

export function allProviderStatuses(env: Record<string, string | undefined> = process.env): ProviderStatus[] {
  return (Object.keys(PROVIDER_CATALOG) as ModuleKey[]).map((m) => providerStatus(m, env));
}
