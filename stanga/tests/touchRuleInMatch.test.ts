/**
 * The touch rule inside the real simulation.
 *
 * TouchRuleEngine is tested on its own elsewhere; these run it through the
 * physics, the AI and the match flow, which is where a rule this central
 * either works or quietly deadlocks the game.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AIController } from '../src/ai/AIController';
import { GameConfig } from '../src/config/GameConfig';
import { createPlayerCommand, type PlayerCommand } from '../src/input/PlayerCommand';
import { MatchSession } from '../src/game/MatchSession';
import { TWO_VS_TWO_ROSTER } from '../src/game/MatchRoster';
import type { ViolationRecord } from '../src/game/MatchState';
import type { HavokModule } from '../src/physics/PhysicsWorld';
import { HeadlessMatch } from '../src/server/HeadlessMatch';
import { loadHavok } from '../src/server/loadHavokNode';

const DT = 1 / 60;

let havok: HavokModule;
const created: HeadlessMatch[] = [];

function makeMatch(): HeadlessMatch {
  const match = HeadlessMatch.create(havok);
  created.push(match);
  return match;
}

/** Drives one player and steps the match, tick by tick. */
function driver(headless: HeadlessMatch, playerId: string) {
  const command = createPlayerCommand(playerId, 0);
  let tick = 0;
  return {
    get tick() {
      return tick;
    },
    step(patch: Partial<PlayerCommand> = {}) {
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
    },
  };
}

beforeAll(async () => {
  havok = await loadHavok();
}, 30_000);

afterEach(() => {
  while (created.length > 0) created.pop()?.dispose();
});

describe('the touch rule in a running match', () => {
  it('calls a double touch when a player chases their own touch', () => {
    const headless = makeMatch();
    const violations: ViolationRecord[] = [];
    headless.match.events.on('violation', (record) => violations.push(record));
    headless.match.start();

    const drive = driver(headless, 'home-1');
    for (let i = 0; i < 200; i += 1) drive.step();

    // Run at the ball, and keep running after it. The first contact is legal;
    // going after it once it has come down is not.
    for (let i = 0; i < 400 && violations.length === 0; i += 1) {
      const me = headless.match.state.players.find((player) => player.id === 'home-1');
      const ball = headless.match.state.ball.position;
      if (!me) break;
      const dx = ball.x - me.position.x;
      const dz = ball.z - me.position.z;
      const length = Math.hypot(dx, dz) || 1;
      drive.step({ moveX: dx / length, moveY: dz / length, sprintPressed: true });
    }

    expect(violations).toHaveLength(1);
    expect(violations[0]?.kind).toBe('doubleTouch');
    expect(violations[0]?.playerId).toBe('home-1');
    expect(violations[0]?.offendingTeam).toBe('home');
    expect(violations[0]?.restartTeam).toBe('away');
    expect(violations[0]?.restartPlayerId).toBe('away-1');
    expect(headless.match.state.phase).toBe('violation');
    // The restart is inside the pitch and never right on a goal line.
    const spot = headless.match.state.ball.position;
    expect(Math.abs(spot.z)).toBeLessThanOrEqual(
      GameConfig.field.length / 2 - GameConfig.touch.restartGoalMargin + 0.01,
    );
    expect(headless.match.state.score).toEqual({ home: 0, away: 0 });
  }, 30_000);

  it('gives the turn back to everybody after the restart', () => {
    const headless = makeMatch();
    headless.match.start();
    const drive = driver(headless, 'home-1');
    for (let i = 0; i < 200; i += 1) drive.step();

    for (let i = 0; i < 400 && headless.match.state.phase !== 'violation'; i += 1) {
      const me = headless.match.state.players.find((player) => player.id === 'home-1');
      const ball = headless.match.state.ball.position;
      if (!me) break;
      const dx = ball.x - me.position.x;
      const dz = ball.z - me.position.z;
      const length = Math.hypot(dx, dz) || 1;
      drive.step({ moveX: dx / length, moveY: dz / length, sprintPressed: true });
    }
    expect(headless.match.state.phase).toBe('violation');

    // Ride out the freeze.
    for (let i = 0; i < 120; i += 1) drive.step();

    expect(headless.match.state.phase).toBe('playing');
    expect(headless.match.touchRule.canTouch('home-1')).toBe(true);
    expect(headless.match.touchRule.canTouch('away-1')).toBe(true);
    expect(headless.match.state.touch.lastMeaningfulTouchPlayerId).toBeNull();
  }, 30_000);

  it('passes only to a legal team-mate, whoever the client asks for', () => {
    const headless = makeMatch();
    headless.match.setRoster(TWO_VS_TWO_ROSTER);
    const passes: { playerId: string; targetId: string }[] = [];
    headless.match.events.on('pass', (event) => passes.push(event));
    headless.match.start();

    const drive = driver(headless, 'home-1');
    for (let i = 0; i < 200; i += 1) drive.step();

    // Stand the passer on the ball with a team-mate in front and an opponent
    // in exactly the same place, then ask for every slot there is — including
    // the opponent's and ones that do not exist.
    const passer = headless.match.state.players.find((player) => player.id === 'home-1');
    const mate = headless.match.state.players.find((player) => player.id === 'home-2');
    const rival = headless.match.state.players.find((player) => player.id === 'away-1');
    expect(passer && mate && rival).toBeTruthy();

    for (const preferredPassSlot of [-1, 0, 1, 2, 7, -99]) {
      headless.match.bodyFor('home-1')?.reset({ x: 0, y: 0, z: 0 });
      headless.match.bodyFor('home-2')?.reset({ x: 0, y: 0, z: 6 });
      headless.match.bodyFor('away-1')?.reset({ x: 0.9, y: 0, z: 6 });
      headless.match.ball.reset({ x: 0, y: GameConfig.ball.radius, z: 0.8 });
      for (let i = 0; i < 20; i += 1) drive.step();

      drive.step({ passPressed: true, preferredPassSlot, aimX: 0, aimY: 1 });
      for (let i = 0; i < 20; i += 1) drive.step();
    }

    expect(passes.length).toBeGreaterThan(0);
    for (const pass of passes) {
      expect(pass.playerId).toBe('home-1');
      // Never the opponent, never a slot that does not exist, never itself.
      expect(pass.targetId).toBe('home-2');
    }
  }, 30_000);

  it('lets two computer players play a full match without deadlocking', () => {
    const headless = makeMatch();
    let touches = 0;
    let kicks = 0;
    headless.match.events.on('touch', () => {
      touches += 1;
    });
    headless.match.events.on('kick', () => {
      kicks += 1;
    });

    const session = new MatchSession(headless.match, {
      mode: 'vsComputer',
      slots: [
        {
          playerId: 'home-1',
          team: 'home',
          name: 'A',
          colorId: 0,
          controller: new AIController('home-1', 'home', 'normal'),
        },
        {
          playerId: 'away-1',
          team: 'away',
          name: 'B',
          colorId: 1,
          controller: new AIController('away-1', 'away', 'normal'),
        },
      ],
      aimAssist: 0,
    });
    headless.match.start();

    for (let tick = 0; tick < 60 * 60; tick += 1) {
      session.collectCommands(tick, 0, DT);
      headless.step(DT, tick);
    }

    // The failure this guards against is a stalemate: everyone waiting for
    // somebody else to be allowed to play the ball.
    expect(touches).toBeGreaterThan(10);
    expect(kicks).toBeGreaterThan(3);
  }, 60_000);

  it('keeps four computer players moving the ball too', () => {
    const headless = makeMatch();
    headless.match.setRoster(TWO_VS_TWO_ROSTER);
    let touches = 0;
    headless.match.events.on('touch', () => {
      touches += 1;
    });

    const session = new MatchSession(headless.match, {
      mode: 'vsComputer',
      slots: TWO_VS_TWO_ROSTER.entries.map((entry) => ({
        playerId: entry.playerId,
        team: entry.team,
        name: entry.playerId,
        colorId: entry.team === 'home' ? 0 : 1,
        controller: new AIController(entry.playerId, entry.team, 'normal'),
      })),
      aimAssist: 0,
    });
    headless.match.start();

    for (let tick = 0; tick < 60 * 45; tick += 1) {
      session.collectCommands(tick, 0, DT);
      headless.step(DT, tick);
    }

    expect(touches).toBeGreaterThan(10);
  }, 60_000);

  it('counts what each player did, as the simulation sees it', () => {
    const headless = makeMatch();
    headless.match.setRoster(TWO_VS_TWO_ROSTER);
    headless.match.start();

    const drive = driver(headless, 'home-1');
    for (let i = 0; i < 200; i += 1) drive.step();

    // One legal touch, then chase it down for an illegal second one.
    for (let i = 0; i < 400 && headless.match.state.phase !== 'violation'; i += 1) {
      const me = headless.match.state.players.find((player) => player.id === 'home-1');
      const ball = headless.match.state.ball.position;
      if (!me) break;
      const dx = ball.x - me.position.x;
      const dz = ball.z - me.position.z;
      const length = Math.hypot(dx, dz) || 1;
      drive.step({ moveX: dx / length, moveY: dz / length, sprintPressed: true });
    }

    const stats = headless.match.state.stats;
    expect(headless.match.state.phase).toBe('violation');
    expect(stats['home-1']?.violations).toBe(1);
    expect(stats['home-1']?.touches).toBeGreaterThanOrEqual(1);
    // The illegal touch is not counted as a touch, and nobody else moved.
    expect(stats['home-2']?.touches).toBe(0);
    expect(stats['away-1']?.violations).toBe(0);
  }, 30_000);

  it('starts a fresh match with a clean sheet', () => {
    const headless = makeMatch();
    headless.match.start();
    const drive = driver(headless, 'home-1');
    for (let i = 0; i < 300; i += 1) {
      const me = headless.match.state.players.find((player) => player.id === 'home-1');
      const ball = headless.match.state.ball.position;
      if (!me) break;
      const dx = ball.x - me.position.x;
      const dz = ball.z - me.position.z;
      const length = Math.hypot(dx, dz) || 1;
      drive.step({ moveX: dx / length, moveY: dz / length, sprintPressed: true });
    }
    expect(headless.match.state.stats['home-1']?.touches).toBeGreaterThan(0);

    headless.match.start();
    expect(headless.match.state.stats['home-1']?.touches).toBe(0);
    expect(headless.match.state.recentTouches).toHaveLength(0);
  }, 30_000);
});
