import { MIN_SCENE_MS } from '@sahar/media';

/** A scene in the editor. `id` is absent for scenes created in this editing session. */
export interface EditorScene {
  id?: string;
  startMs: number;
  endMs: number;
  /** Scenes with takes cannot be removed (their takes would be orphaned). */
  locked: boolean;
}

export function sceneIndexAt(scenes: EditorScene[], ms: number): number {
  const index = scenes.findIndex((scene) => ms >= scene.startMs && ms < scene.endMs);
  return index === -1 ? scenes.length - 1 : index;
}

/** Splits the scene under `ms` in two; the left part keeps the identity. Null if too close to an edge. */
export function splitAt(
  scenes: EditorScene[],
  ms: number,
): { scenes: EditorScene[]; index: number } | null {
  const at = Math.round(ms);
  const index = sceneIndexAt(scenes, at);
  const scene = scenes[index];
  if (!scene || at - scene.startMs < MIN_SCENE_MS || scene.endMs - at < MIN_SCENE_MS) return null;
  const next = [...scenes];
  next.splice(
    index,
    1,
    { ...scene, endMs: at },
    { startMs: at, endMs: scene.endMs, locked: false },
  );
  return { scenes: next, index: index + 1 };
}

/** Merges scene `index` with the following one (the following one is removed). */
export function mergeWithNext(scenes: EditorScene[], index: number): EditorScene[] | null {
  const scene = scenes[index];
  const following = scenes[index + 1];
  if (!scene || !following || following.locked) return null;
  const next = [...scenes];
  next.splice(index, 2, { ...scene, endMs: following.endMs });
  return next;
}

/**
 * Moves the boundary between scene `boundary - 1` and `boundary` to `ms`, clamped so both
 * neighbours keep at least MIN_SCENE_MS.
 */
export function moveBoundary(scenes: EditorScene[], boundary: number, ms: number): EditorScene[] {
  const left = scenes[boundary - 1];
  const right = scenes[boundary];
  if (!left || !right) return scenes;
  const clamped = Math.round(
    Math.min(Math.max(ms, left.startMs + MIN_SCENE_MS), right.endMs - MIN_SCENE_MS),
  );
  if (clamped === left.endMs) return scenes;
  const next = [...scenes];
  next[boundary - 1] = { ...left, endMs: clamped };
  next[boundary] = { ...right, startMs: clamped };
  return next;
}
