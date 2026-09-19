/**
 * The fixed timestep is what makes the simulation reproducible and, later,
 * server-authoritative. These tests pin its behaviour at 60 FPS, at 30 FPS and
 * when the browser stalls.
 */
import { describe, expect, it } from 'vitest';
import { GameConfig } from '../src/config/GameConfig';
import { SimulationLoop } from '../src/core/SimulationLoop';
import { damp, rotateTowards, angleDelta, clamp, yawFromXZ } from '../src/core/math';

const FIXED_MS = GameConfig.simulation.fixedDeltaMs;

function recorder() {
  const deltas: number[] = [];
  const loop = new SimulationLoop((dt) => deltas.push(dt));
  return { loop, deltas };
}

describe('SimulationLoop', () => {
  it('runs one tick per frame at 60 FPS', () => {
    const { loop, deltas } = recorder();
    for (let i = 0; i < 60; i += 1) loop.advance(FIXED_MS);
    expect(deltas).toHaveLength(60);
    expect(loop.currentTick).toBe(60);
  });

  it('runs two ticks per frame at 30 FPS, keeping real time', () => {
    const { loop, deltas } = recorder();
    for (let i = 0; i < 30; i += 1) loop.advance(1000 / 30);
    expect(deltas).toHaveLength(60);
    const simulated = deltas.reduce((total, dt) => total + dt, 0);
    expect(simulated).toBeCloseTo(1, 2);
  });

  it('always steps by exactly the fixed delta, whatever the frame rate', () => {
    const { loop, deltas } = recorder();
    for (const frame of [16.6, 33.3, 8.2, 51.1, 12.9]) loop.advance(frame);
    for (const dt of deltas) {
      expect(dt).toBe(GameConfig.simulation.fixedDeltaSeconds);
    }
  });

  it('caps catch-up so a stall cannot spiral', () => {
    const { loop, deltas } = recorder();
    loop.advance(5000);
    expect(deltas.length).toBeLessThanOrEqual(GameConfig.simulation.maxTicksPerFrame);
  });

  it('does not simulate a long background pause all at once', () => {
    const { loop, deltas } = recorder();
    loop.advance(60_000);
    const simulated = deltas.reduce((total, dt) => total + dt, 0);
    expect(simulated).toBeLessThan(1);
  });

  it('exposes an interpolation alpha between 0 and 1', () => {
    const { loop } = recorder();
    loop.advance(FIXED_MS * 1.5);
    expect(loop.alpha).toBeGreaterThanOrEqual(0);
    expect(loop.alpha).toBeLessThan(1);
  });

  it('drops the backlog on reset but keeps the tick counter', () => {
    const { loop, deltas } = recorder();
    loop.advance(FIXED_MS * 2.5);
    const ticks = loop.currentTick;
    loop.reset();
    loop.advance(FIXED_MS * 0.5);
    expect(loop.currentTick).toBe(ticks);
    expect(deltas.length).toBe(ticks);
  });

  it('restarts tick numbering for a new match', () => {
    const { loop } = recorder();
    loop.advance(FIXED_MS * 10);
    loop.resetTicks();
    expect(loop.currentTick).toBe(0);
  });
});

describe('math helpers', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it('finds the shortest way round a circle', () => {
    expect(angleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 6);
    expect(angleDelta(0, -Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 6);
    // Going from just below 2pi to just above 0 is a tiny step forwards.
    expect(angleDelta(Math.PI * 1.9, Math.PI * 2.1)).toBeCloseTo(Math.PI * 0.2, 5);
  });

  it('rotates towards a target without overshooting', () => {
    expect(rotateTowards(0, 1, 10)).toBe(1);
    expect(rotateTowards(0, 1, 0.25)).toBeCloseTo(0.25, 6);
    expect(rotateTowards(0, -1, 0.25)).toBeCloseTo(-0.25, 6);
  });

  it('derives yaw so that +Z is zero', () => {
    expect(yawFromXZ(0, 1)).toBeCloseTo(0, 6);
    expect(yawFromXZ(1, 0)).toBeCloseTo(Math.PI / 2, 6);
    expect(yawFromXZ(0, -1)).toBeCloseTo(Math.PI, 6);
  });

  it('damps at the same rate whatever the timestep', () => {
    let small = 0;
    for (let i = 0; i < 4; i += 1) small = damp(small, 1, 0.2, 1 / 240);
    const large = damp(0, 1, 0.2, 1 / 60);
    expect(small).toBeCloseTo(large, 3);
  });
});
