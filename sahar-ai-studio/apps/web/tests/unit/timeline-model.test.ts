import { validateSceneLayout } from '@sahar/media';
import { describe, expect, it } from 'vitest';
import {
  mergeWithNext,
  moveBoundary,
  sceneIndexAt,
  splitAt,
  type EditorScene,
} from '@/lib/timeline-model';

const layout: EditorScene[] = [
  { id: 'a', startMs: 0, endMs: 4000, locked: false },
  { id: 'b', startMs: 4000, endMs: 9000, locked: true },
  { id: 'c', startMs: 9000, endMs: 12000, locked: false },
];

describe('timeline model', () => {
  it('finds the scene under a time, with the end belonging to the last scene', () => {
    expect(sceneIndexAt(layout, 0)).toBe(0);
    expect(sceneIndexAt(layout, 4000)).toBe(1);
    expect(sceneIndexAt(layout, 12000)).toBe(2);
  });

  it('splits keeping the identity on the left part', () => {
    const result = splitAt(layout, 6000)!;
    expect(result.index).toBe(2);
    expect(result.scenes.map((s) => [s.id, s.startMs, s.endMs])).toEqual([
      ['a', 0, 4000],
      ['b', 4000, 6000],
      [undefined, 6000, 9000],
      ['c', 9000, 12000],
    ]);
    expect(validateSceneLayout(result.scenes, 12000)).toBeNull();
  });

  it('refuses splits that would create too-short scenes', () => {
    expect(splitAt(layout, 4200)).toBeNull();
    expect(splitAt(layout, 8800)).toBeNull();
  });

  it('merges with the next scene unless that one has takes', () => {
    expect(mergeWithNext(layout, 1)!.map((s) => [s.id, s.startMs, s.endMs])).toEqual([
      ['a', 0, 4000],
      ['b', 4000, 12000],
    ]);
    expect(mergeWithNext(layout, 0)).toBeNull(); // 'b' is locked
    expect(mergeWithNext(layout, 2)).toBeNull(); // nothing after the last scene
  });

  it('moves boundaries with clamping and keeps a valid tiling', () => {
    const moved = moveBoundary(layout, 1, 5000);
    expect(moved[0]!.endMs).toBe(5000);
    expect(moved[1]!.startMs).toBe(5000);
    expect(moveBoundary(layout, 1, -100)[0]!.endMs).toBe(500);
    expect(moveBoundary(layout, 1, 99999)[0]!.endMs).toBe(8500);
    expect(validateSceneLayout(moveBoundary(layout, 2, 11900), 12000)).toBeNull();
    expect(moveBoundary(layout, 0, 1000)).toBe(layout);
  });
});
