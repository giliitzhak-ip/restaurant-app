/**
 * The gate for the whole online stage: the simulation must run in Node, with no
 * browser, no renderer and no second physics implementation. If this file ever
 * fails, the authoritative server and the client have started to drift.
 */
import { describe, expect, it, beforeAll, afterEach } from 'vitest';
import { GameConfig } from '../src/config/GameConfig';
import { createPlayerCommand, type PlayerCommand } from '../src/input/PlayerCommand';
import { TWO_VS_TWO_ROSTER } from '../src/game/MatchRoster';
import { HeadlessMatch } from '../src/server/HeadlessMatch';
import { loadHavok } from '../src/server/loadHavokNode';
import type { HavokModule } from '../src/physics/PhysicsWorld';
import type { ScoreEventRecord } from '../src/game/MatchState';

const DT = 1 / 60;

let havok: HavokModule;
const created: HeadlessMatch[] = [];

function makeMatch(seed?: number): HeadlessMatch {
  const match = HeadlessMatch.create(havok, seed === undefined ? {} : { seed });
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

/** Drives one player with a scripted command, tick by tick. */
function driver(headless: HeadlessMatch) {
  const command = createPlayerCommand('home-1', 0);
  let tick = 0;
  return (patch: Partial<PlayerCommand> = {}) => {
    Object.assign(
      command,
      {
        moveX: 0,
        moveY: 0,
        aimX: 0,
        aimY: 1,
        sprintPressed: false,
        shootPressed: false,
        shootHeld: false,
        shootReleased: false,
        tacklePressed: false,
        lobToggle: false,
        tickId: tick,
        sequenceNumber: tick,
      },
      patch,
    );
    headless.match.submitCommand(command);
    headless.step(DT, tick);
    tick += 1;
  };
}

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

  it('places the ball exactly where a reset asks, instead of firing it there', () => {
    const headless = makeMatch();
    headless.match.start();
    run(headless, 240);

    headless.match.ball.reset({ x: 3, y: GameConfig.ball.radius, z: -6 });
    run(headless, 1, 240);

    // Havok has no teleport of its own: setTargetTransform gives the body a
    // *velocity* towards the target, which used to hurl the ball across the
    // pitch on every kickoff.
    expect(headless.match.state.ball.position.x).toBeCloseTo(3, 1);
    expect(headless.match.state.ball.position.z).toBeCloseTo(-6, 1);
    expect(headless.match.ball.speed).toBeLessThan(1);
  });

  it('lets a charged shot leave the foot instead of being eaten by the assist', () => {
    const headless = makeMatch();
    const kicks: number[] = [];
    headless.match.events.on('kick', (event) => kicks.push(event.power));
    headless.match.start();

    const drive = driver(headless);
    for (let i = 0; i < 240; i += 1) drive();

    // Stand the shooter just behind the ball, both clear of the opponent.
    headless.match.ball.reset({ x: 0, y: GameConfig.ball.radius, z: 11 });
    for (let i = 0; i < 5; i += 1) drive();
    headless.match.bodyFor('home-1')?.reset({ x: 0, y: 0, z: 10.2 });
    for (let i = 0; i < 20; i += 1) drive();

    for (let i = 0; i < 70; i += 1) drive({ shootHeld: true, shootPressed: i === 0 });
    drive({ shootReleased: true });
    for (let i = 0; i < 90; i += 1) drive();

    expect(kicks).toHaveLength(1);
    expect(kicks[0]).toBeGreaterThan(0.9);
    // The ball reached the net rather than being dragged back by ball control.
    expect(headless.match.state.score.home).toBe(GameConfig.match.points.goal);
    expect(headless.match.state.phase).toBe('celebration');
  });

  it('runs a four-player roster with no special casing', () => {
    const headless = makeMatch();
    headless.match.setRoster(TWO_VS_TWO_ROSTER);
    headless.match.start();

    run(headless, 240);

    expect(headless.match.players).toHaveLength(4);
    expect(headless.match.state.players).toHaveLength(4);
    expect(headless.match.state.phase).toBe('playing');
    // Four capsules, four distinct places to stand.
    const spots = headless.match.state.players.map((player) => player.position);
    for (let i = 0; i < spots.length; i += 1) {
      for (let j = i + 1; j < spots.length; j += 1) {
        const a = spots[i];
        const b = spots[j];
        if (!a || !b) continue;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.5);
      }
    }
    expect(headless.match.state.ball.position.y).toBeGreaterThan(GameConfig.ball.radius * 0.7);
  });

  it('can pick out the crossbar and the junction without passing through them', () => {
    // The five-point junction is what STANGA is about, so the frame has to be
    // reachable: a ball that tunnels through it at speed would make the
    // highest-scoring shot in the game impossible to hit on purpose.
    const { field, goal, ball } = GameConfig;
    const hits = new Map<string, number>();

    const fire = (offsetX: number, up: number, along: number) => {
      const headless = makeMatch();
      headless.match.events.on('frameHit', (event) => {
        hits.set(event.part, (hits.get(event.part) ?? 0) + 1);
      });
      headless.match.start();
      run(headless, 200);

      headless.match.ball.reset({ x: offsetX, y: ball.radius, z: field.length / 2 - 9 });
      run(headless, 6, 200);
      headless.match.ball.setVelocity(0, up, along);
      run(headless, 45, 210);

      headless.dispose();
      created.pop();
    };

    // Sweep the launch angle rather than solving the ballistics: air drag and
    // the bounce make a closed form fragile, and what matters is that the bar
    // and the corner are hittable at all.
    for (let up = 7.5; up <= 11.5; up += 0.5) {
      fire(0, up, 22);
      fire(-(goal.width / 2 + goal.postRadius), up, 22);
    }

    expect(hits.get('crossbar') ?? 0).toBeGreaterThan(0);
    expect(hits.get('leftJunction') ?? 0).toBeGreaterThan(0);
  }, 60_000);

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
