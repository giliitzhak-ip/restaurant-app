/**
 * Assists.
 *
 * The rule is small enough to state in one sentence and easy enough to get
 * subtly wrong, which is exactly what these cover.
 */
import { describe, expect, it } from 'vitest';
import { findAssist } from '../src/game/Attribution';
import type { TouchLogEntry } from '../src/game/MatchState';

const touch = (playerId: string, team: 'home' | 'away', tick: number): TouchLogEntry => ({
  playerId,
  team,
  tick,
});

describe('findAssist', () => {
  it('credits the team-mate who touched it last', () => {
    const log = [touch('home-1', 'home', 100), touch('home-2', 'home', 80)];
    expect(findAssist(log, 'home-1', 'home', 110, 360)).toBe('home-2');
  });

  it('never credits the scorer for their own build-up', () => {
    const log = [touch('home-1', 'home', 100), touch('home-1', 'home', 90)];
    expect(findAssist(log, 'home-1', 'home', 110, 360)).toBeNull();
  });

  it('never credits an opponent', () => {
    const log = [touch('away-1', 'away', 100), touch('away-2', 'away', 80)];
    expect(findAssist(log, 'home-1', 'home', 110, 360)).toBeNull();
  });

  it('still credits a pass that took a deflection on the way', () => {
    // The defender got a touch in between; the pass was still the assist.
    const log = [
      touch('home-1', 'home', 100),
      touch('away-1', 'away', 95),
      touch('home-2', 'home', 90),
    ];
    expect(findAssist(log, 'home-1', 'home', 110, 360)).toBe('home-2');
  });

  it('lets an old touch expire rather than turning into an assist', () => {
    const log = [touch('home-1', 'home', 500), touch('home-2', 'home', 10)];
    expect(findAssist(log, 'home-1', 'home', 510, 360)).toBeNull();
  });

  it('has nothing to credit on an empty log', () => {
    expect(findAssist([], 'home-1', 'home', 10, 360)).toBeNull();
  });
});
