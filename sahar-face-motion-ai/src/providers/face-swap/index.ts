import { gpuWorkerFaceSwap } from "./gpu-worker";
import { magicHourFaceSwap } from "./magichour";
import { mockFaceSwap } from "./mock";
import type { FaceSwapProvider } from "./types";

/** Every face swap adapter that exists in code. Add a vendor = add a file + one line here. */
const ADAPTERS: FaceSwapProvider[] = [mockFaceSwap, magicHourFaceSwap, gpuWorkerFaceSwap];

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

export type { FaceSwapProvider } from "./types";
