import { gpuWorkerFaceSwap } from "./gpu-worker";
import { facefusionLocal } from "./facefusion-local";
import { magicHourFaceSwap } from "./magichour";
import { mockFaceSwap } from "./mock";
import type { FaceSwapProvider } from "./types";

/** Every face swap adapter that exists in code. Add a vendor = add a file + one line here. */
const ADAPTERS: FaceSwapProvider[] = [mockFaceSwap, facefusionLocal, magicHourFaceSwap, gpuWorkerFaceSwap];

export function faceSwapAdapters(): FaceSwapProvider[] {
  return ADAPTERS;
}

export function getFaceSwapProvider(id: string): FaceSwapProvider | null {
  return ADAPTERS.find((p) => p.id === id) ?? null;
}

/** The provider selected with FACE_SWAP_PROVIDER (default: mock). */
export function selectedFaceSwapProvider(env: Record<string, string | undefined> = process.env): FaceSwapProvider | null {
  return getFaceSwapProvider((env.FACE_SWAP_PROVIDER || "mock").trim());
}

/**
 * Engines the user may choose from in the studio: FACE_SWAP_PROVIDERS (comma list),
 * always including the default FACE_SWAP_PROVIDER.
 */
export function enabledFaceSwapProviders(env: Record<string, string | undefined> = process.env): FaceSwapProvider[] {
  const ids = new Set([(env.FACE_SWAP_PROVIDER || "mock").trim(), ...(env.FACE_SWAP_PROVIDERS || "").split(",").map((s) => s.trim()).filter(Boolean)]);
  return ADAPTERS.filter((p) => ids.has(p.id));
}

export function getEnabledFaceSwapProvider(id: string | undefined, env: Record<string, string | undefined> = process.env): FaceSwapProvider | null {
  if (!id) return selectedFaceSwapProvider(env);
  return enabledFaceSwapProviders(env).find((p) => p.id === id) ?? null;
}

/** Hebrew reason a provider can't run on this server right now, or null if it can. */
export function unavailableReason(p: FaceSwapProvider, env: Record<string, string | undefined> = process.env): string | null {
  if (p.requiredEnv.some((k) => !env[k])) return "חסר מפתח API בשרת";
  const a = p.available?.();
  return a && !a.ok ? a.detail : null;
}

export type { FaceSwapProvider } from "./types";
