/**
 * Node-side Havok loader.
 *
 * Emscripten's own `locateFile` path goes through `fetch()`, which has no
 * meaning for a file path on a server, so the `.wasm` is read from disk and
 * handed over as bytes instead.
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import HavokPhysics from '@babylonjs/havok';
import type { HavokModule } from '../physics/PhysicsWorld';

let havokModulePromise: Promise<HavokModule> | null = null;

/** Loads the Havok WASM module once per process. */
export async function loadHavok(): Promise<HavokModule> {
  havokModulePromise ??= (async () => {
    const require = createRequire(import.meta.url);
    const wasmPath = require.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm');
    const file = await readFile(wasmPath);
    // Node hands back a Buffer, which is a view onto a larger pool; Havok's
    // typings (and emscripten) want a standalone ArrayBuffer.
    const wasmBinary = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    return HavokPhysics({ wasmBinary });
  })();
  return havokModulePromise;
}
