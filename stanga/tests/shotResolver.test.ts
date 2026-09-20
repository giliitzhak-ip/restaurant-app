/**
 * The strike system: what the server does with what a client asks for.
 *
 * Every number here is clamped on the way in, which is the whole point — a
 * client can ask for a shot from the far side of the pitch at ten times the
 * power and get a legal one back.
 */
import { describe, expect, it } from 'vitest';
import { GameConfig } from '../src/config/GameConfig';
import { describeShot, magnusImpulse, resolveShot } from '../src/game/ShotResolver';

const base = { yaw: 0, power: 0.8, verticalAim: 0, spin: 0, chipRequested: false };

/** Horizontal speed the ball leaves with, given the impulse. */
function launchSpeed(impulse: { impulseX: number; impulseZ: number }): number {
  return Math.hypot(impulse.impulseX, impulse.impulseZ) / GameConfig.ball.mass;
}

function launchLift(shot: { impulseY: number; impulseX: number; impulseZ: number }): number {
  return shot.impulseY / Math.hypot(shot.impulseX, shot.impulseZ);
}

describe('resolveShot', () => {
  it('clamps power into the range the server allows', () => {
    const tooMuch = resolveShot({ ...base, power: 99 });
    const tooLittle = resolveShot({ ...base, power: -99 });
    expect(tooMuch.power).toBe(1);
    expect(tooLittle.power).toBe(GameConfig.kick.minPower);
    expect(launchSpeed(tooMuch)).toBeLessThanOrEqual(GameConfig.ball.maxSpeed * 1.5);
  });

  it('clamps the vertical aim and the spin, whatever the client claims', () => {
    const wild = resolveShot({ ...base, verticalAim: 50, spin: -50 });
    const sane = resolveShot({ ...base, verticalAim: 1, spin: -1 });
    expect(wild.impulseY).toBeCloseTo(sane.impulseY, 6);
    expect(wild.spinRate).toBeCloseTo(sane.spinRate, 6);
    expect(Math.abs(wild.spinRate)).toBeLessThanOrEqual(GameConfig.kick.maxSpinRate);
  });

  it('never returns a NaN, however broken the request', () => {
    const broken = resolveShot({
      yaw: Number.NaN,
      power: Number.NaN,
      verticalAim: Number.NaN,
      spin: Number.NaN,
      chipRequested: false,
    });
    for (const value of [
      broken.power,
      broken.spinRate,
      broken.impulseX,
      broken.impulseY,
      broken.impulseZ,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('aims continuously: higher aim, higher ball, all the way up', () => {
    const lifts = [-1, -0.5, 0, 0.5, 1].map((verticalAim) =>
      launchLift(resolveShot({ ...base, verticalAim })),
    );
    for (let i = 1; i < lifts.length; i += 1) {
      expect(lifts[i]).toBeGreaterThan(lifts[i - 1] ?? 0);
    }
    // A flat-out ground shot stays on the deck; a full lob really goes up.
    expect(lifts[0]).toBeLessThan(0.1);
    expect(lifts[4]).toBeGreaterThan(0.8);
  });

  it('gives the four profiles genuinely different trajectories', () => {
    const ground = resolveShot({ ...base, power: 0.3, verticalAim: -0.9 });
    const driven = resolveShot({ ...base, power: 0.95, verticalAim: -0.6 });
    const lofted = resolveShot({ ...base, power: 0.8, verticalAim: 0.9 });
    const chip = resolveShot({ ...base, power: 0.9, verticalAim: 0, chipRequested: true });

    expect(ground.profile).toBe('ground');
    expect(driven.profile).toBe('driven');
    expect(lofted.profile).toBe('lofted');
    expect(chip.profile).toBe('chip');

    // Driven is the fastest; lofted trades speed for height; a chip is short
    // and steep, which is what makes it a chip rather than a weak lob.
    expect(launchSpeed(driven)).toBeGreaterThan(launchSpeed(ground));
    expect(launchLift(lofted)).toBeGreaterThan(launchLift(driven));
    expect(launchSpeed(chip)).toBeLessThan(launchSpeed(driven));
    expect(launchLift(chip)).toBeGreaterThan(launchLift(lofted));
    // And a chip can never be hit as hard as a shot.
    expect(chip.power).toBeLessThanOrEqual(GameConfig.kick.chipMaxPower);
  });

  it('calls a spun ball curled', () => {
    const curled = resolveShot({ ...base, spin: 0.9 });
    expect(curled.profile).toBe('curled');
    expect(Math.abs(curled.spinRate)).toBeGreaterThanOrEqual(GameConfig.kick.curlThreshold);

    const straight = resolveShot({ ...base, spin: 0.05 });
    expect(straight.profile).not.toBe('curled');
  });

  it('names a chip a chip whatever else is asked for', () => {
    expect(describeShot(1.4, 1, 30, true)).toBe('chip');
  });
});

describe('magnus force', () => {
  it('pushes sideways, never along the flight', () => {
    const bend = magnusImpulse(20, 0, 18, 1 / 60);
    // Flying along +Z with top-down spin: the push is purely on X.
    expect(Math.abs(bend.z)).toBeLessThan(1e-9);
    expect(bend.x).not.toBe(0);
  });

  it('bends the other way for the other spin', () => {
    const right = magnusImpulse(20, 0, 18, 1 / 60);
    const left = magnusImpulse(-20, 0, 18, 1 / 60);
    expect(Math.sign(right.x)).toBe(-Math.sign(left.x));
  });

  it('does nothing to a ball that is not moving', () => {
    const bend = magnusImpulse(25, 0, 0, 1 / 60);
    expect(bend.x).toBeCloseTo(0, 10);
    expect(bend.z).toBeCloseTo(0, 10);
  });
});
