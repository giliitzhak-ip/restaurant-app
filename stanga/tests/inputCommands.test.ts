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
      lobToggle: false,
    });
  });

  it('clears every flag on reset and records the sequence number', () => {
    const command = createPlayerCommand('home-1');
    command.shootReleased = true;
    command.shootHeld = true;
    command.tacklePressed = true;
    command.sprintPressed = true;
    command.lobToggle = true;
    command.aimX = 1;

    resetPlayerCommand(command, 42, 99);

    expect(command.tickId).toBe(42);
    expect(command.sequenceNumber).toBe(99);
    expect(command.shootReleased).toBe(false);
    expect(command.shootHeld).toBe(false);
    expect(command.tacklePressed).toBe(false);
    expect(command.sprintPressed).toBe(false);
    expect(command.lobToggle).toBe(false);
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

    expect(['ChaseBall', 'ControlBall', 'Attack', 'Aim']).toContain(ai.currentState);
    // Away attacks -Z, and the ball is at z=4 while the AI sits at z=12.
    expect(command.moveY).toBeLessThan(0);
  });

  it('charges and then releases a shot near the goal it attacks', () => {
    const state = liveMatch();
    state.ball.position = { x: 0, y: 0.11, z: -11 };
    state.players[1]!.position = { x: 0, y: 0, z: -10.6 };
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
    expect(seen.has('Aim')).toBe(true);
    expect(held).toBe(true);
    expect(released).toBe(true);
  });

  it('asks for a shot-type toggle only when its plan differs from the player', () => {
    const state = liveMatch();
    state.ball.position = { x: 0, y: 0.11, z: -11 };
    state.players[1]!.position = { x: 0, y: 0, z: -10.6 };

    const ai = new AIController('away-1', 'away', 'hard', new Rng(21));
    let toggles = 0;
    for (let tick = 1; tick <= 200; tick += 1) {
      const command = ai.poll('away-1', tick, contextFor(state, 'away-1'));
      if (command.lobToggle) {
        toggles += 1;
        // The simulation owns the state; mirror what the engine would do.
        state.players[1]!.lofted = !state.players[1]!.lofted;
      }
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

  it('plays differently on different seeds but replays identically on the same one', () => {
    const run = (seed: number) => {
      const state = liveMatch();
      state.ball.position = { x: 1, y: 0.11, z: 1 };
      const ai = new AIController('away-1', 'away', 'normal', new Rng(seed));
      const path: number[] = [];
      for (let tick = 1; tick <= 120; tick += 1) {
        const command = ai.poll('away-1', tick, contextFor(state, 'away-1'));
        path.push(Math.round(command.moveX * 1000));
      }
      return path.join(',');
    };
    expect(run(1)).not.toBe(run(999));
    // A server will need the same seed to produce the same match.
    expect(run(5)).toBe(run(5));
  });
});
