/**
 * Browser-side Havok loader. Kept apart from PhysicsWorld because the `?url`
 * import below is a Vite feature — importing it from Node would throw, and the
 * authoritative server imports the physics layer directly.
 */
import HavokPhysics from '@babylonjs/havok';
import havokWasmUrl from '@babylonjs/havok/lib/esm/HavokPhysics.wasm?url';
import type { HavokModule } from './PhysicsWorld';

let havokModulePromise: Promise<HavokModule> | null = null;

/** Loads the Havok WASM module once per page. */
export async function loadHavok(): Promise<HavokModule> {
  havokModulePromise ??= HavokPhysics({ locateFile: () => havokWasmUrl });
  return havokModulePromise;
}
