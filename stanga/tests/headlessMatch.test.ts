/**
 * The gate for the whole online stage: the simulation must run in Node, with no
 * browser, no renderer and no second physics implementation. If this file ever
 * fails, the authoritative server and the client have started to drift.
 */
import { describe, expect, it, beforeAll, afterEach } from 'vitest';
import { GameConfig } from '../src/config/GameConfig';
import { HeadlessMatch } from '../src/server/HeadlessMatch';
import { loadHavok } from '../src/server/loadHavokNode';
import type { HavokModule } from '../src/physics/PhysicsWorld';
import type { ScoreEventRecord } from '../src/game/MatchState';

const DT = 1 / 60;

let havok: HavokModule;
const created: HeadlessMatch[] = [];

function makeMatch(seed?: number): HeadlessMatch {
  const match = HeadlessMatch.create(havok, seed);
  created.push(match);
  return match;
}

function run(headless: HeadlessMatch, ticks: number, from = 0): number {
  let tick = from;
  for (let i = 0; i < ticks; i += 1) headless.step(DT, tick++);
  return tick;
}

beforeAll(async () => {
  havok = await loadHavok();
}, 30_000);

afterEach(() => {
  while (created.length > 0) created.pop()?.dispose();
});

describe('headless simulation', () => {
  it('builds a scene, physics world and match engine without a renderer', () => {
    const headless = makeMatch();
    expect(headless.match.players).toHaveLength(2);
    expect(headless.arena.goals.get('home')?.parts.size).toBe(5);
    expect(headless.arena.goals.get('away')?.parts.size).toBe(5);
    expect(headless.arena.walls).toHaveLength(4);
  });

  it('runs the kickoff countdown and settles the ball on the ground', () => {
    const headless = makeMatch();
    headless.match.start();
    expect(headless.match.state.phase).toBe('kickoff');

    run(headless, 240);

    expect(headless.match.state.phase).toBe('playing');
    // Resting on the asphalt, not sunk into it and not floating.
    expect(headless.match.state.ball.position.y).toBeGreaterThan(GameConfig.ball.radius * 0.7);
    expect(headless.match.state.ball.position.y).toBeLessThan(GameConfig.ball.radius * 1.6);
  });

  it('detects a goal and awards STANGA points server-side', () => {
    const headless = makeMatch();
    const scored: ScoreEventRecord[] = [];
    headless.match.events.on('scored', (record) => scored.push(record));
    headless.match.start();

    const tick = run(headless, 200);

    // Credit the last touch, then fire the ball wide of the opponent into the net.
    const { ball } = headless.match.state;
    ball.lastTouchBy = 'home-1';
    ball.lastTouchTeam = 'home';
    ball.lastTouchTick = headless.match.state.tick;
    headless.match.ball.setVelocity(3, 1, 26);

    run(headless, 90, tick);

    expect(scored).toHaveLength(1);
    expect(scored[0]?.kind).toBe('goal');
    expect(scored[0]?.points).toBe(GameConfig.match.points.goal);
    expect(headless.match.state.phase).toBe('celebration');
  });

  it('is deterministic: the same seed and the same ticks give the same state', () => {
    const a = makeMatch(1234);
    const b = makeMatch(1234);
    a.match.start();
    b.match.start();

    run(a, 180);
    run(b, 180);

    expect(JSON.stringify(a.match.state)).toBe(JSON.stringify(b.match.state));
  });
});
