/**
 * The unified command model: everything that drives a player — keyboard, touch
 * and AI — must funnel through this exact shape. These tests pin the stick
 * maths that makes local and (later) networked commands behave identically.
 */
import { describe, expect, it } from 'vitest';
import { GameConfig } from '../src/config/GameConfig';
import { applyStick, createCommand, resetCommand, rotateByYaw } from '../src/input/Command';
import { AIController, type AIState } from '../src/ai/AIController';
import { Rng } from '../src/core/Rng';
import { createMatchState, type MatchState } from '../src/game/MatchState';
import { startMatch } from '../src/game/MatchRules';

const DEAD_ZONE = GameConfig.input.deadZone;

describe('input command model', () => {
  it('starts neutral', () => {
    const command = createCommand('home-1');
    expect(command).toMatchObject({
      playerId: 'home-1',
      moveX: 0,
      moveZ: 0,
      sprint: false,
      chargeKick: false,
      releaseKick: false,
      tackle: false,
    });
  });

  it('clears edge-triggered actions on reset but keeps the player id', () => {
    const command = createCommand('home-1');
    command.releaseKick = true;
    command.tackle = true;
    command.sprint = true;
    resetCommand(command, 42);
    expect(command.tick).toBe(42);
    expect(command.releaseKick).toBe(false);
    expect(command.tackle).toBe(false);
    expect(command.sprint).toBe(false);
    expect(command.playerId).toBe('home-1');
  });

  it('swallows stick movement inside the dead zone', () => {
    const command = createCommand('home-1');
    applyStick(command, DEAD_ZONE * 0.5, 0, DEAD_ZONE);
    expect(command.moveX).toBe(0);
    expect(command.moveZ).toBe(0);
  });

  it('never exceeds unit length at full deflection', () => {
    const command = createCommand('home-1');
    applyStick(command, 1, 1, DEAD_ZONE);
    expect(Math.hypot(command.moveX, command.moveZ)).toBeCloseTo(1, 5);
  });

  it('scales smoothly from the dead zone to full deflection', () => {
    const command = createCommand('home-1');
    applyStick(command, (1 + DEAD_ZONE) / 2, 0, DEAD_ZONE);
    expect(command.moveX).toBeGreaterThan(0.4);
    expect(command.moveX).toBeLessThan(0.6);
  });

  it('rotates a camera-relative stick into world space', () => {
    const forward = rotateByYaw(0, 1, 0);
    expect(forward.x).toBeCloseTo(0, 6);
    expect(forward.z).toBeCloseTo(1, 6);

    const quarterTurn = rotateByYaw(0, 1, Math.PI / 2);
    expect(quarterTurn.x).toBeCloseTo(1, 6);
    expect(quarterTurn.z).toBeCloseTo(0, 6);

    const halfTurn = rotateByYaw(0, 1, Math.PI);
    expect(halfTurn.x).toBeCloseTo(0, 6);
    expect(halfTurn.z).toBeCloseTo(-1, 6);
  });
});

function liveMatch(): MatchState {
  const state = createMatchState();
  startMatch(state);
  state.phase = 'playing';
  return state;
}

describe('AI controller', () => {
  it('emits the same command shape a human produces', () => {
    const ai = new AIController('away-1', 'away', 'normal', new Rng(1));
    const command = ai.update(liveMatch(), 1 / 60, 1);
    expect(command.playerId).toBe('away-1');
    expect(Number.isFinite(command.moveX)).toBe(true);
    expect(Number.isFinite(command.aimYaw)).toBe(true);
    expect(Math.hypot(command.moveX, command.moveZ)).toBeLessThanOrEqual(1.001);
  });

  it('chases a loose ball and moves towards it', () => {
    const state = liveMatch();
    state.ball.position = { x: 3, y: 0.11, z: 4 };
    state.players[1]!.position = { x: 3, y: 0, z: 12 };
    state.players[0]!.position = { x: -8, y: 0, z: -12 };

    const ai = new AIController('away-1', 'away', 'normal', new Rng(7));
    let command = ai.update(state, 1 / 60, 1);
    for (let i = 0; i < 60; i += 1) command = ai.update(state, 1 / 60, i + 2);

    expect(['ChaseBall', 'ControlBall', 'Attack', 'Aim']).toContain(ai.currentState);
    // Away attacks -Z, and the ball is at z=4 while the AI sits at z=12.
    expect(command.moveZ).toBeLessThan(0);
  });

  it('shoots when it has the ball near the goal it attacks', () => {
    const state = liveMatch();
    // Away attacks -Z; put it right on top of the ball in front of that goal.
    state.ball.position = { x: 0, y: 0.11, z: -11 };
    state.players[1]!.position = { x: 0, y: 0, z: -10.6 };
    state.players[0]!.position = { x: 9, y: 0, z: 9 };

    const ai = new AIController('away-1', 'away', 'hard', new Rng(3));
    const seen = new Set<AIState>();
    let released = false;
    for (let tick = 1; tick <= 240; tick += 1) {
      const command = ai.update(state, 1 / 60, tick);
      seen.add(ai.currentState);
      if (command.releaseKick) released = true;
    }
    expect(seen.has('Aim')).toBe(true);
    expect(released).toBe(true);
  });

  it('idles during a celebration and after full time', () => {
    const state = liveMatch();
    const ai = new AIController('away-1', 'away', 'easy', new Rng(11));

    state.phase = 'celebration';
    let command = ai.update(state, 1 / 60, 1);
    expect(ai.currentState).toBe('Recover');
    expect(command.moveX).toBe(0);
    expect(command.moveZ).toBe(0);

    state.phase = 'finished';
    command = ai.update(state, 1 / 60, 2);
    expect(command.releaseKick).toBe(false);
    expect(command.tackle).toBe(false);
  });

  it('plays differently on different seeds', () => {
    const run = (seed: number) => {
      const state = liveMatch();
      state.ball.position = { x: 1, y: 0.11, z: 1 };
      const ai = new AIController('away-1', 'away', 'normal', new Rng(seed));
      const path: number[] = [];
      for (let tick = 1; tick <= 120; tick += 1) {
        const command = ai.update(state, 1 / 60, tick);
        path.push(Math.round(command.moveX * 1000));
      }
      return path.join(',');
    };
    expect(run(1)).not.toBe(run(999));
    // ...but the same seed always replays identically, which a server will need.
    expect(run(5)).toBe(run(5));
  });
});
