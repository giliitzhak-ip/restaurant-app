/**
 * The flight model the simulation, the opponent and the aim preview all share.
 *
 * It matters that there is exactly one of these. When the preview drew from a
 * different model it promised arcs the ball did not take, and when the AI
 * predicted from a different model it ran to the wrong place.
 */
import { describe, expect, it } from 'vitest';
import { GameConfig } from '../src/config/GameConfig';
import {
  advanceFlight,
  airDragFactor,
  magnusAcceleration,
  predictBall,
  rollingFactor,
  sampleFlight,
  type FlightState,
} from '../src/game/BallFlight';
import { resolveShot } from '../src/game/ShotResolver';
import type { BallState } from '../src/game/MatchState';

const DT = 1 / 60;

function ball(velocity: { x: number; y: number; z: number }, height = 0.112): BallState {
  return {
    position: { x: 0, y: height, z: 0 },
    velocity: { ...velocity },
    lastTouchBy: null,
    lastTouchTeam: null,
    lastTouchTick: -1,
  };
}

describe('air drag', () => {
  it('bites harder the faster the ball is going', () => {
    // Quadratic, not linear: that is the whole difference between a hard shot
    // losing its edge over a long ball and it arriving as hard as it left.
    const slow = 1 - airDragFactor(5, DT);
    const fast = 1 - airDragFactor(25, DT);
    expect(fast).toBeGreaterThan(slow * 4);
  });

  it('never reverses the ball, however absurd the speed', () => {
    expect(airDragFactor(1e6, DT)).toBe(0);
    expect(rollingFactor(10)).toBe(0);
  });
});

describe('predictBall', () => {
  it('leads a rolling ball down the pitch', () => {
    const rolling = ball({ x: 0, y: 0, z: 9 });
    const soon = predictBall(rolling, 0.5);
    expect(soon.z).toBeGreaterThan(2);
    // Rolling resistance and drag both act, so it never reaches the naive
    // distance of speed times time.
    expect(soon.z).toBeLessThan(9 * 0.5);
  });

  it('brings a lofted ball back down', () => {
    const lofted = ball({ x: 0, y: 9, z: 6 }, 0.5);
    const peak = predictBall(lofted, 0.45, 12);
    const later = predictBall(lofted, 2.2, 24);
    expect(peak.y).toBeGreaterThan(lofted.position.y + 2);
    expect(later.y).toBeLessThan(peak.y);
  });

  it('keeps its answer on the pitch', () => {
    // An opponent chasing a prediction that left the ground would run at the
    // fence and stand there.
    const escaping = ball({ x: 60, y: 0, z: 60 });
    const guess = predictBall(escaping, 3);
    expect(Math.abs(guess.x)).toBeLessThanOrEqual(GameConfig.field.width / 2);
    expect(Math.abs(guess.z)).toBeLessThanOrEqual(
      GameConfig.field.length / 2 + GameConfig.goal.depth,
    );
  });

  it('agrees with stepping the same flight by hand', () => {
    const moving = ball({ x: 1, y: 4, z: 7 }, 0.6);
    const byHand: FlightState = {
      x: 0,
      y: 0.6,
      z: 0,
      vx: 1,
      vy: 4,
      vz: 7,
      spin: 0,
    };
    for (let i = 0; i < 12; i += 1) advanceFlight(byHand, 0.6 / 12);
    const predicted = predictBall(moving, 0.6, 12);
    expect(predicted.x).toBeCloseTo(byHand.x, 6);
    expect(predicted.y).toBeCloseTo(byHand.y, 6);
    expect(predicted.z).toBeCloseTo(byHand.z, 6);
  });
});

describe('the aim preview', () => {
  const out = Array.from({ length: 12 }, () => ({ x: 0, y: 0, z: 0 }));

  it('starts at the ball and climbs on a lofted strike', () => {
    const shot = resolveShot({ yaw: 0, power: 1, verticalAim: 0.9, spin: 0, style: 'normal' });
    const used = sampleFlight(
      { x: 0, y: 0.112, z: 0 },
      shot.velocityX,
      shot.velocityY,
      shot.velocityZ,
      shot.spinRate,
      0.85,
      out,
    );
    expect(used).toBeGreaterThan(2);
    expect(out[0]).toEqual({ x: 0, y: 0.112, z: 0 });
    expect(out[used - 1]!.y).toBeGreaterThan(out[0]!.y + 1);
    expect(out[used - 1]!.z).toBeGreaterThan(out[0]!.z + 1);
  });

  it('stops at the first bounce rather than running on', () => {
    // A preview is about the ball leaving the foot, not about where it ends up
    // three bounces later.
    const used = sampleFlight({ x: 0, y: 0.112, z: 0 }, 0, 0, 6, 0, 3, out);
    expect(used).toBeLessThanOrEqual(out.length);
    expect(out[used - 1]!.y).toBeLessThan(0.2);
  });

  it('bends the drawn path the way the spin bends the ball', () => {
    const straight = Array.from({ length: 12 }, () => ({ x: 0, y: 0, z: 0 }));
    const curled = Array.from({ length: 12 }, () => ({ x: 0, y: 0, z: 0 }));
    const origin = { x: 0, y: 0.5, z: 0 };
    sampleFlight(origin, 0, 5, 18, 0, 0.85, straight);
    sampleFlight(origin, 0, 5, 18, GameConfig.kick.maxSpinRate, 0.85, curled);
    expect(Math.abs(curled[11]!.x)).toBeGreaterThan(Math.abs(straight[11]!.x) + 0.1);
  });
});

describe('magnus', () => {
  it('is a bend, not a steer: well under gravity at a full curl', () => {
    const shot = resolveShot({ yaw: 0, power: 1, verticalAim: 0, spin: 1, style: 'curled' });
    const bend = magnusAcceleration(shot.spinRate, 0, shot.speed);
    expect(Math.abs(bend.x)).toBeLessThan(Math.abs(GameConfig.physics.gravity) * 0.5);
  });
});
