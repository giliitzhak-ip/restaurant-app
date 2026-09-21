/**
 * The computer opponent has to actually play.
 *
 * This exists because it once did not: it decided to chase the ball only when
 * it was nearer to it than the opponent, which against a human standing by the
 * ball is never, so it spent whole matches on its defensive line. It touched
 * the ball once a minute and never struck it. None of the other tests noticed,
 * because every one of them asked whether the rules were right rather than
 * whether the game was worth playing.
 *
 * So these assert behaviour, with real physics and the real state machine.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AIController } from '../src/ai/AIController';
import { horizontalDistance } from '../src/core/math';
import { MatchSession } from '../src/game/MatchSession';
import { createPlayerCommand, type PlayerCommand } from '../src/input/PlayerCommand';
import {
  SequenceCounter,
  type ControlContext,
  type PlayerController,
} from '../src/input/PlayerController';
import type { HavokModule } from '../src/physics/PhysicsWorld';
import { HeadlessMatch } from '../src/server/HeadlessMatch';
import { loadHavok } from '../src/server/loadHavokNode';

const DT = 1 / 60;

/** A stand-in for a person: runs at the ball and hits it when close enough. */
class ChasingHuman implements PlayerController {
  readonly kind = 'keyboard' as const;
  readonly deviceId = 'test-human';
  readonly label = 'human';
  private readonly sequence = new SequenceCounter();
  private charge = 0;

  isConnected(): boolean {
    return true;
  }

  reset(): void {
    this.sequence.reset();
    this.charge = 0;
  }

  poll(playerId: string, tickId: number, context: ControlContext): PlayerCommand {
    const command = createPlayerCommand(playerId, tickId);
    command.sequenceNumber = this.sequence.next();
    const me = context.state.players.find((player) => player.id === playerId);
    if (!me) return command;

    const ball = context.state.ball.position;
    const dx = ball.x - me.position.x;
    const dz = ball.z - me.position.z;
    const distance = Math.hypot(dx, dz) || 1;
    command.moveX = dx / distance;
    command.moveY = dz / distance;
    command.sprintPressed = distance > 3;
    command.aimX = dx / distance;
    command.aimY = dz / distance;

    if (distance < 2.2) {
      this.charge += context.dt;
      command.shootHeld = true;
      command.shootPressed = this.charge <= context.dt * 1.5;
    }
    if (this.charge > 0.5) {
      command.shootHeld = false;
      command.shootReleased = true;
      this.charge = 0;
    }
    return command;
  }
}

let havok: HavokModule;
const created: HeadlessMatch[] = [];

beforeAll(async () => {
  havok = await loadHavok();
}, 30_000);

afterEach(() => {
  while (created.length > 0) created.pop()?.dispose();
});

/** Plays `seconds` of a vs-computer match and reports what the AI did. */
function playAgainstTheComputer(seconds: number) {
  const headless = HeadlessMatch.create(havok);
  created.push(headless);

  const ai = new AIController('away-1', 'away', 'normal');
  const session = new MatchSession(headless.match, {
    mode: 'vsComputer',
    slots: [
      {
        playerId: 'home-1',
        team: 'home',
        name: 'אדם',
        colorId: 0,
        controller: new ChasingHuman(),
      },
      { playerId: 'away-1', team: 'away', name: 'מחשב', colorId: 1, controller: ai },
    ],
    aimAssist: 0,
  });

  let touches = 0;
  let kicks = 0;
  headless.match.events.on('touch', (event) => {
    if (event.playerId === 'away-1') touches += 1;
  });
  headless.match.events.on('kick', (event) => {
    if (event.playerId === 'away-1') kicks += 1;
  });

  headless.match.start();
  let distanceSum = 0;
  const ticks = Math.round(seconds / DT);
  for (let tick = 0; tick < ticks; tick += 1) {
    session.collectCommands(tick, 0, DT);
    headless.step(DT, tick);
    const me = headless.match.state.players.find((player) => player.id === 'away-1');
    if (me) distanceSum += horizontalDistance(me.position, headless.match.state.ball.position);
  }

  return { touches, kicks, meanDistance: distanceSum / ticks, state: headless.match.state };
}

describe('the computer opponent', () => {
  it('contests the ball instead of watching the human have it', () => {
    const played = playAgainstTheComputer(45);

    // Before the fix this was one touch and no kicks in sixty seconds.
    expect(played.touches).toBeGreaterThanOrEqual(6);
    expect(played.kicks).toBeGreaterThanOrEqual(4);
    // And it stayed nearly four metres away; a player who is in the game is
    // within a couple of metres of the ball on average.
    expect(played.meanDistance).toBeLessThan(3.5);
  }, 60_000);

  it('goes for the ball even when the human is standing right on it', () => {
    const headless = HeadlessMatch.create(havok);
    created.push(headless);
    const ai = new AIController('away-1', 'away', 'normal');

    headless.match.start();
    const state = headless.match.state;
    const human = state.players.find((player) => player.id === 'home-1');
    const computer = state.players.find((player) => player.id === 'away-1');
    if (!human || !computer) throw new Error('missing players');

    // The human is on top of the ball and the AI is well back: exactly the
    // situation the old "am I nearer than them?" test answered with "stay".
    state.phase = 'playing';
    state.ball.position.x = 0;
    state.ball.position.z = 0;
    human.position.x = 0.3;
    human.position.z = 0.3;
    computer.position.x = 0;
    computer.position.z = -6;

    const command = ai.poll('away-1', 1, { state, dt: DT, cameraYaw: 0, player: computer });

    expect(ai.currentState).toBe('ChaseBall');
    // Moving, and towards the ball rather than away from it.
    expect(Math.hypot(command.moveX, command.moveY)).toBeGreaterThan(0.5);
    expect(command.moveY).toBeGreaterThan(0.5);
  }, 30_000);
});
