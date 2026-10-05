import { describe, expect, it } from 'vitest';
import { AiController, aiProfile, type Difficulty } from '../src/shared/ai';
import { GameSim } from '../src/shared/game';
import { PROFILES } from '../src/shared/paddle';
import { Rng } from '../src/shared/rng';
import { gameWinner } from '../src/shared/rules';

function play(d0: Difficulty, d1: Difficulty, seed: number, bestOf: 1 | 3 = 1, maxSeconds = 1500) {
  const sim = new GameSim({ profiles: [aiProfile(d0), aiProfile(d1)], seed, bestOf });
  const ais = [new AiController(0, d0, new Rng(seed + 1)), new AiController(1, d1, new Rng(seed + 2))];
  const events: string[] = [];
  const pointsSeen: [number, number][] = [];
  for (let i = 0; i < maxSeconds * 240 && sim.phase !== 'matchOver'; i++) {
    for (const s of [0, 1] as const) {
      sim.setInput(s, ais[s].update({ phase: sim.phase, servingSide: sim.servingSide(), hitCount: sim.hitCount, lastHitter: sim.rally.lastHitter, intercept: sim.interceptFor(s), ballX: sim.ball.p.x }, 1 / 240));
    }
    sim.step();
    for (const e of sim.drainEvents()) {
      events.push(e.k);
      if (e.k === 'point') pointsSeen.push([...sim.match.points] as [number, number]);
    }
  }
  return { sim, events, pointsSeen };
}

describe('full game simulation (shared by single player and server)', () => {
  it('AI vs AI plays a complete, valid 11-point game with real rallies', () => {
    const { sim, events } = play('medium', 'medium', 42);
    expect(sim.phase).toBe('matchOver');
    const [a, b] = sim.match.games[0] ? sim.match.points : sim.match.points;
    expect(gameWinner(a, b)).toBe(sim.match.winner);
    const hits = events.filter((e) => e === 'hit').length;
    const points = events.filter((e) => e === 'point').length;
    expect(points).toBe(a + b);
    expect(hits / points).toBeGreaterThan(2.5); // not just aces and misses
  });

  it('best of three ends when a player wins two games', () => {
    const { sim } = play('hard', 'easy', 7, 3);
    expect(sim.phase).toBe('matchOver');
    expect(Math.max(...sim.match.games)).toBe(2);
    expect(sim.match.winner).not.toBeNull();
  });

  it('is deterministic for a given seed', () => {
    const a = play('medium', 'hard', 5);
    const b = play('medium', 'hard', 5);
    expect(a.sim.match.points).toEqual(b.sim.match.points);
    expect(a.sim.tick).toBe(b.sim.tick);
  });

  it('difficulty levels are ordered and the hard AI is beatable', () => {
    let hardVsEasy = 0;
    let easyVsHardPoints = 0;
    for (const seed of [1, 2, 3]) {
      const r = play('hard', 'easy', seed);
      if (r.sim.match.winner === 0) hardVsEasy++;
      easyVsHardPoints += r.sim.match.points[1];
    }
    expect(hardVsEasy).toBeGreaterThanOrEqual(2);
    // Hard AI makes mistakes: the easy AI still wins some points.
    expect(easyVsHardPoints).toBeGreaterThan(0);
  });

  it('a passive player loses points but the game keeps flowing (no stalls)', () => {
    const sim = new GameSim({ profiles: [PROFILES.arcade, aiProfile('medium')], seed: 3, autoServe: [2, 2] });
    const ai = new AiController(1, 'medium', new Rng(3));
    for (let i = 0; i < 240 * 120 && sim.phase !== 'matchOver'; i++) {
      sim.setInput(1, ai.update({ phase: sim.phase, servingSide: sim.servingSide(), hitCount: sim.hitCount, lastHitter: sim.rally.lastHitter, intercept: sim.interceptFor(1), ballX: sim.ball.p.x }, 1 / 240));
      sim.step();
    }
    expect(sim.phase).toBe('matchOver');
    expect(sim.match.winner).toBe(1);
  });

  it('replayPoint abandons a rally without awarding a point', () => {
    const { sim } = { sim: new GameSim({ profiles: [aiProfile('medium'), aiProfile('medium')], seed: 1, autoServe: [0.5, 0.5] }) };
    sim.advance(3.0 + 0.5 + 0.1); // countdown + auto serve
    expect(sim.phase).toBe('rally');
    sim.replayPoint();
    expect(sim.phase).toBe('serve');
    expect(sim.match.points).toEqual([0, 0]);
  });
});
