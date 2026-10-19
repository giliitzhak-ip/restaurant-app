import { describe, expect, it } from 'vitest';
import { DEFAULT_PROPOSAL, proposeScenes, validateSceneLayout } from './scenes';

const lengths = (scenes: { startMs: number; endMs: number }[]) =>
  scenes.map((s) => s.endMs - s.startMs);

describe('proposeScenes', () => {
  it('keeps short songs as one scene', () => {
    expect(proposeScenes(9_000, [], null)).toEqual([{ startMs: 0, endMs: 9_000 }]);
  });

  it('always tiles the song within the length bounds', () => {
    for (const duration of [12_001, 30_000, 61_234, 185_000, 600_000]) {
      const scenes = proposeScenes(duration, [], null);
      expect(validateSceneLayout(scenes, duration)).toBeNull();
      for (const length of lengths(scenes)) {
        expect(length).toBeGreaterThanOrEqual(DEFAULT_PROPOSAL.minMs);
        expect(length).toBeLessThanOrEqual(DEFAULT_PROPOSAL.maxMs);
      }
    }
  });

  it('cuts in the middle of silences when they are in range', () => {
    const scenes = proposeScenes(
      40_000,
      [
        { startMs: 9_000, endMs: 10_000 },
        { startMs: 19_000, endMs: 21_000 },
      ],
      null,
    );
    expect(scenes.map((s) => s.endMs)).toContain(9_500);
    expect(scenes.map((s) => s.endMs)).toContain(20_000);
    expect(validateSceneLayout(scenes, 40_000)).toBeNull();
  });

  it('falls back to beats near the target length', () => {
    const beats = Array.from({ length: 80 }, (_, i) => 250 + i * 500); // 120 BPM, offset 250 ms
    const scenes = proposeScenes(40_000, [], beats);
    for (const scene of scenes.slice(0, -1)) expect(beats).toContain(scene.endMs);
    expect(validateSceneLayout(scenes, 40_000)).toBeNull();
  });

  it('ignores silences at the very start and end', () => {
    const scenes = proposeScenes(
      30_000,
      [
        { startMs: 0, endMs: 2_000 },
        { startMs: 28_000, endMs: 30_000 },
      ],
      null,
    );
    expect(scenes[0]!.endMs).not.toBe(1_000);
    expect(validateSceneLayout(scenes, 30_000)).toBeNull();
  });
});

describe('validateSceneLayout', () => {
  it('accepts a contiguous tiling', () => {
    expect(
      validateSceneLayout(
        [
          { startMs: 0, endMs: 5000 },
          { startMs: 5000, endMs: 9000 },
        ],
        9000,
      ),
    ).toBeNull();
  });

  it('reports each class of problem', () => {
    expect(validateSceneLayout([], 9000)).toBe('empty');
    expect(validateSceneLayout([{ startMs: 10, endMs: 9000 }], 9000)).toBe('notStartingAtZero');
    expect(validateSceneLayout([{ startMs: 0, endMs: 8000 }], 9000)).toBe('notEndingAtDuration');
    expect(
      validateSceneLayout(
        [
          { startMs: 0, endMs: 4000 },
          { startMs: 4100, endMs: 9000 },
        ],
        9000,
      ),
    ).toBe('gapOrOverlap');
    expect(
      validateSceneLayout(
        [
          { startMs: 0, endMs: 8800 },
          { startMs: 8800, endMs: 9000 },
        ],
        9000,
      ),
    ).toBe('tooShort');
    expect(
      validateSceneLayout(
        [
          { startMs: 0, endMs: 4000.5 },
          { startMs: 4000.5, endMs: 9000 },
        ],
        9000,
      ),
    ).toBe('gapOrOverlap');
  });
});
