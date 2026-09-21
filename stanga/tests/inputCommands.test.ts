/**
 * The unified command model: every source of intent — keyboard, gamepad, touch
 * and AI — must funnel through this exact shape, and the simulation must not be
 * able to tell them apart.
 */
import { describe, expect, it } from 'vitest';
import { GameConfig } from '../src/config/GameConfig';
import {
  applyDeadZone,
  createPlayerCommand,
  resetPlayerCommand,
  rotateByYaw,
  yawOf,
} from '../src/input/PlayerCommand';
import { AIController, type AIState } from '../src/ai/AIController';
import { Rng } from '../src/core/Rng';
import { createMatchState, type MatchState } from '../src/game/MatchState';
import { startMatch } from '../src/game/MatchRules';
import type { ControlContext } from '../src/input/PlayerController';

const DEAD_ZONE = GameConfig.input.deadZone;

function contextFor(state: MatchState, playerId: string, cameraYaw = 0): ControlContext {
  return {
    cameraYaw,
    player: state.players.find((player) => player.id === playerId),
    state,
    dt: GameConfig.simulation.fixedDeltaSeconds,
  };
}

describe('player command model', () => {
  it('starts neutral and carries an identity', () => {
    const command = createPlayerCommand('home-1', 7);
    expect(command).toMatchObject({
      playerId: 'home-1',
      tickId: 7,
      moveX: 0,
      moveY: 0,
      aimX: 0,
      aimY: 0,
      sprintPressed: false,
      shootPressed: false,
      shootHeld: false,
      shootReleased: false,
      tacklePressed: false,
      styleCycle: false,
      shotStyle: 'normal',
    });
  });

  it('clears every flag on reset and records the sequence number', () => {
    const command = createPlayerCommand('home-1');
    command.shootReleased = true;
    command.shootHeld = true;
    command.tacklePressed = true;
    command.sprintPressed = true;
    command.styleCycle = true;
    command.shotStyle = 'chip';
    command.aimX = 1;

    resetPlayerCommand(command, 42, 99);

    expect(command.tickId).toBe(42);
    expect(command.sequenceNumber).toBe(99);
    expect(command.shootReleased).toBe(false);
    expect(command.shootHeld).toBe(false);
    expect(command.tacklePressed).toBe(false);
    expect(command.sprintPressed).toBe(false);
    expect(command.styleCycle).toBe(false);
    expect(command.shotStyle).toBe('normal');
    expect(command.aimX).toBe(0);
    expect(command.playerId).toBe('home-1');
  });

  it('is fully serializable, which is what a server will need', () => {
    const command = createPlayerCommand('home-1', 3);
    command.moveX = 0.5;
    const round = JSON.parse(JSON.stringify(command)) as typeof command;
    expect(round).toEqual(command);
  });
});

describe('dead zone', () => {
  it('swallows movement inside the dead zone', () => {
    const result = applyDeadZone(DEAD_ZONE * 0.5, 0, DEAD_ZONE);
    expect(result).toEqual({ x: 0, y: 0, magnitude: 0 });
  });

  it('never exceeds unit length at full deflection', () => {
    const result = applyDeadZone(1, 1, DEAD_ZONE);
    expect(Math.hypot(result.x, result.y)).toBeCloseTo(1, 5);
  });

  it('rescales so the stick still reaches full range past the dead zone', () => {
    const result = applyDeadZone((1 + DEAD_ZONE) / 2, 0, DEAD_ZONE);
    expect(result.magnitude).toBeGreaterThan(0.4);
    expect(result.magnitude).toBeLessThan(0.6);
  });

  it('handles a zero vector without dividing by zero', () => {
    expect(applyDeadZone(0, 0, DEAD_ZONE)).toEqual({ x: 0, y: 0, magnitude: 0 });
  });
});

describe('camera-relative to world-space conversion', () => {
  it('leaves the vector alone at yaw zero', () => {
    const forward = rotateByYaw(0, 1, 0);
    expect(forward.x).toBeCloseTo(0, 6);
    expect(forward.z).toBeCloseTo(1, 6);
  });

  it('rotates a quarter turn', () => {
    const result = rotateByYaw(0, 1, Math.PI / 2);
    expect(result.x).toBeCloseTo(1, 6);
    expect(result.z).toBeCloseTo(0, 6);
  });

  it('rotates a half turn', () => {
    const result = rotateByYaw(0, 1, Math.PI);
    expect(result.x).toBeCloseTo(0, 6);
    expect(result.z).toBeCloseTo(-1, 6);
  });

  it('derives yaw so that +Z is zero', () => {
    expect(yawOf(0, 1)).toBeCloseTo(0, 6);
    expect(yawOf(1, 0)).toBeCloseTo(Math.PI / 2, 6);
    expect(yawOf(0, -1)).toBeCloseTo(Math.PI, 6);
  });
});

function liveMatch(): MatchState {
  const state = createMatchState();
  startMatch(state);
  state.phase = 'playing';
  return state;
}

describe('AI controller as a PlayerController', () => {
  it('satisfies the controller contract', () => {
    const ai = new AIController('away-1', 'away', 'normal', new Rng(1));
    expect(ai.kind).toBe('ai');
    expect(ai.deviceId).toBe('ai:away-1');
    expect(ai.isConnected()).toBe(true);
  });

  it('emits the same command shape a human produces', () => {
    const state = liveMatch();
    const ai = new AIController('away-1', 'away', 'normal', new Rng(1));
    const command = ai.poll('away-1', 1, contextFor(state, 'away-1'));

    expect(command.playerId).toBe('away-1');
    expect(command.sequenceNumber).toBeGreaterThan(0);
    expect(Number.isFinite(command.moveX)).toBe(true);
    expect(Number.isFinite(command.aimX)).toBe(true);
    expect(Math.hypot(command.moveX, command.moveY)).toBeLessThanOrEqual(1.001);
  });

  it('ignores the camera entirely, unlike a human controller', () => {
    const state = liveMatch();
    state.ball.position = { x: 4, y: 0.11, z: 3 };
    const first = new AIController('away-1', 'away', 'normal', new Rng(4));
    const second = new AIController('away-1', 'away', 'normal', new Rng(4));

    const a = first.poll('away-1', 1, contextFor(state, 'away-1', 0));
    const b = second.poll('away-1', 1, contextFor(state, 'away-1', Math.PI / 2));
    expect(a.moveX).toBeCloseTo(b.moveX, 9);
    expect(a.moveY).toBeCloseTo(b.moveY, 9);
  });

  it('chases a loose ball and moves towards it', () => {
    const state = liveMatch();
    state.ball.position = { x: 3, y: 0.11, z: 4 };
    state.players[1]!.position = { x: 3, y: 0, z: 12 };
    state.players[0]!.position = { x: -8, y: 0, z: -12 };

    const ai = new AIController('away-1', 'away', 'normal', new Rng(7));
    let command = ai.poll('away-1', 1, contextFor(state, 'away-1'));
    for (let i = 0; i < 60; i += 1) {
      command = ai.poll('away-1', i + 2, contextFor(state, 'away-1'));
    }

    expect(['Chase', 'Intercept', 'Attack', 'PrepareShot', 'Support', 'Defend']).toContain(
      ai.currentState,
    );
    // Away attacks -Z, and the ball is at z=4 while the AI sits at z=12.
    expect(command.moveY).toBeLessThan(0);
  });

  it('charges on the way in and releases the shot near the goal it attacks', () => {
    const state = liveMatch();
    state.ball.position = { x: 0, y: 0.11, z: -11 };
    // Inside kicking range but not close enough to bump the ball, so the shot
    // has to be loaded first. Standing on the ball would fire immediately,
    // which is also correct but is not what this test is about.
    state.players[1]!.position = { x: 0, y: 0, z: -9.7 };
    state.players[0]!.position = { x: 9, y: 0, z: 9 };

    const ai = new AIController('away-1', 'away', 'hard', new Rng(3));
    const seen = new Set<AIState>();
    let held = false;
    let released = false;
    for (let tick = 1; tick <= 240; tick += 1) {
      const command = ai.poll('away-1', tick, contextFor(state, 'away-1'));
      seen.add(ai.currentState);
      if (command.shootHeld) held = true;
      if (command.shootReleased) released = true;
    }
    // Running onto the ball is where the charge happens now: one touch means
    // the shot has to be loaded before the foot ever reaches the ball.
    const onTheBall: AIState[] = ['Chase', 'Intercept', 'Attack', 'PrepareShot'];
    expect(onTheBall.some((name) => seen.has(name))).toBe(true);
    expect(held).toBe(true);
    expect(released).toBe(true);
  });

  it('changes the shape of its strike deliberately, not once per tick', () => {
    const state = liveMatch();
    state.ball.position = { x: 0, y: 0.11, z: -11 };
    state.players[1]!.position = { x: 0, y: 0, z: -10.6 };

    const ai = new AIController('away-1', 'away', 'hard', new Rng(21));
    let toggles = 0;
    for (let tick = 1; tick <= 200; tick += 1) {
      const command = ai.poll('away-1', tick, contextFor(state, 'away-1'));
      if (command.styleCycle) toggles += 1;
    }
    // It must never flap: a handful of deliberate changes, not one per tick.
    expect(toggles).toBeLessThan(12);
  });

  it('idles during a celebration and after full time', () => {
    const state = liveMatch();
    const ai = new AIController('away-1', 'away', 'easy', new Rng(11));

    state.phase = 'celebration';
    let command = ai.poll('away-1', 1, contextFor(state, 'away-1'));
    expect(ai.currentState).toBe('Recover');
    expect(command.moveX).toBe(0);
    expect(command.moveY).toBe(0);

    state.phase = 'finished';
    command = ai.poll('away-1', 2, contextFor(state, 'away-1'));
    expect(command.shootReleased).toBe(false);
    expect(command.tacklePressed).toBe(false);
  });

  it('replays identically on the same seed, so a server can reproduce a match', () => {
    const run = (seed: number) => {
      const state = liveMatch();
      state.ball.position = { x: 1, y: 0.11, z: 1 };
      const ai = new AIController('away-1', 'away', 'normal', new Rng(seed));
      const path: number[] = [];
      for (let tick = 1; tick <= 120; tick += 1) {
        const command = ai.poll('away-1', tick, contextFor(state, 'away-1'));
        path.push(Math.round(command.moveX * 1000), Math.round(command.aimX * 1000));
      }
      return path.join(',');
    };
    expect(run(5)).toBe(run(5));
    expect(run(1)).not.toBe(run(999));
  });

  it('runs at the ball the same way whatever the seed, and aims differently', () => {
    /*
     * The seed is personality, not pathfinding.
     *
     * Running at a loose ball is the same straight line for everybody — the
     * variation belongs in where the shot is aimed and how hard it is hit. It
     * used to show up in the movement too, but only because the AI was
     * standing off the ball on a wandering defensive line instead of going for
     * it, which is the bug this pins shut.
     */
    const run = (seed: number) => {
      const state = liveMatch();
      state.ball.position = { x: 1, y: 0.11, z: 1 };
      const ai = new AIController('away-1', 'away', 'normal', new Rng(seed));
      const moves: number[] = [];
      const aims: number[] = [];
      for (let tick = 1; tick <= 120; tick += 1) {
        const command = ai.poll('away-1', tick, contextFor(state, 'away-1'));
        moves.push(Math.round(command.moveX * 1000));
        aims.push(Math.round(command.aimX * 1000));
      }
      return { state: ai.currentState, moves: moves.join(','), aims: aims.join(',') };
    };

    const a = run(1);
    const b = run(999);
    expect(['Chase', 'Intercept', 'Attack', 'PrepareShot']).toContain(a.state);
    expect(a.moves).toBe(b.moves);
    expect(a.aims).not.toBe(b.aims);
  });
});
