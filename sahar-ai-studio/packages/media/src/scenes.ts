import type { TimeRange } from './silence';

export interface SceneSpan {
  startMs: number;
  endMs: number;
}

export interface ProposalOptions {
  /** Preferred scene length. */
  targetMs: number;
  minMs: number;
  /** Hard upper bound (e.g. the selected provider's maximum generation length). */
  maxMs: number;
}

export const DEFAULT_PROPOSAL: ProposalOptions = { targetMs: 8_000, minMs: 3_000, maxMs: 12_000 };

/** Smallest scene the editor allows. */
export const MIN_SCENE_MS = 500;
export const MAX_SCENES = 300;

interface Candidate {
  timeMs: number;
  weight: number;
}

/**
 * Proposes scene boundaries for a song:
 *  - cuts prefer the middle of silences (phrase breaks), then beats (when the tempo was
 *    reliable), and are kept within [minMs, maxMs] of the previous cut;
 *  - with no candidate in range, the cut falls at targetMs (snapped to a nearby beat).
 * Scenes are contiguous and cover the whole song.
 */
export function proposeScenes(
  durationMs: number,
  silences: TimeRange[],
  beatTimesMs: number[] | null,
  options: ProposalOptions = DEFAULT_PROPOSAL,
): SceneSpan[] {
  const { targetMs, minMs, maxMs } = options;
  if (durationMs <= 0) return [];
  if (durationMs <= maxMs) return [{ startMs: 0, endMs: durationMs }];

  const candidates: Candidate[] = [
    ...silences
      .filter((s) => s.endMs - s.startMs >= 200 && s.startMs > 0 && s.endMs < durationMs)
      .map((s) => ({ timeMs: Math.round((s.startMs + s.endMs) / 2), weight: 3 })),
    ...(beatTimesMs ?? []).map((timeMs) => ({ timeMs, weight: 1 })),
  ].sort((a, b) => a.timeMs - b.timeMs);

  const nearestBeat = (timeMs: number, toleranceMs: number) => {
    let best: number | null = null;
    for (const beat of beatTimesMs ?? []) {
      if (
        Math.abs(beat - timeMs) <= toleranceMs &&
        (best === null || Math.abs(beat - timeMs) < Math.abs(best - timeMs))
      ) {
        best = beat;
      }
    }
    return best;
  };

  const cuts: number[] = [];
  let position = 0;
  while (durationMs - position > maxMs) {
    const lo = position + minMs;
    const hi = Math.min(position + maxMs, durationMs - minMs);
    const ideal = position + targetMs;

    let chosen: number | null = null;
    let bestScore = -Infinity;
    for (const candidate of candidates) {
      if (candidate.timeMs < lo) continue;
      if (candidate.timeMs > hi) break;
      const score = candidate.weight - (Math.abs(candidate.timeMs - ideal) / targetMs) * 2;
      if (score > bestScore) {
        bestScore = score;
        chosen = candidate.timeMs;
      }
    }
    if (chosen === null) {
      const fallback = Math.min(ideal, hi);
      chosen = nearestBeat(fallback, 500) ?? fallback;
      if (chosen < lo || chosen > hi) chosen = fallback;
    }
    cuts.push(chosen);
    position = chosen;
  }

  // A short tail merges into the previous scene or shares it evenly.
  const tail = durationMs - position;
  if (cuts.length > 0 && tail < minMs) {
    const previousStart = cuts.length > 1 ? cuts[cuts.length - 2]! : 0;
    const combined = durationMs - previousStart;
    cuts.pop();
    if (combined > maxMs) cuts.push(previousStart + Math.round(combined / 2));
  }

  const bounds = [0, ...cuts, durationMs];
  return bounds.slice(0, -1).map((startMs, i) => ({ startMs, endMs: bounds[i + 1]! }));
}

export type SceneLayoutError =
  'empty' | 'tooMany' | 'notStartingAtZero' | 'notEndingAtDuration' | 'gapOrOverlap' | 'tooShort';

/** Scenes must tile the song exactly: [0, duration], contiguous, each ≥ MIN_SCENE_MS. */
export function validateSceneLayout(
  scenes: SceneSpan[],
  durationMs: number,
): SceneLayoutError | null {
  if (scenes.length === 0) return 'empty';
  if (scenes.length > MAX_SCENES) return 'tooMany';
  if (scenes[0]!.startMs !== 0) return 'notStartingAtZero';
  if (scenes[scenes.length - 1]!.endMs !== durationMs) return 'notEndingAtDuration';
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i]!;
    if (!Number.isInteger(scene.startMs) || !Number.isInteger(scene.endMs)) return 'gapOrOverlap';
    if (scene.endMs - scene.startMs < MIN_SCENE_MS) return 'tooShort';
    if (i > 0 && scenes[i - 1]!.endMs !== scene.startMs) return 'gapOrOverlap';
  }
  return null;
}
