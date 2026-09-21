/**
 * The strike system: what the server does with what a client asks for.
 *
 * Every number here is clamped on the way in, which is the whole point — a
 * client can ask for a shot from the far side of the pitch at ten times the
 * power and get a legal one back.
 */
import { describe, expect, it } from 'vitest';
import { GameConfig, SHOT_STYLE_ORDER, type ShotStyle } from '../src/config/GameConfig';
import {
  describeShot,
  elevationFor,
  magnusAcceleration,
  resolveShot,
  type ShotRequest,
} from '../src/game/ShotResolver';

const base: ShotRequest = { yaw: 0, power: 0.8, verticalAim: 0, spin: 0, style: 'normal' };

const degrees = (radians: number) => (radians * 180) / Math.PI;

describe('resolveShot', () => {
  it('clamps power into the range the server allows', () => {
    const tooMuch = resolveShot({ ...base, power: 99 });
    const tooLittle = resolveShot({ ...base, power: -99 });
    expect(tooMuch.power).toBe(1);
    expect(tooLittle.power).toBe(GameConfig.kick.minPower);
    expect(tooMuch.speed).toBeLessThanOrEqual(GameConfig.ball.maxSpeed);
  });

  it('clamps the vertical aim and the spin, whatever the client claims', () => {
    const wild = resolveShot({ ...base, verticalAim: 50, spin: -50 });
    const sane = resolveShot({ ...base, verticalAim: 1, spin: -1 });
    expect(wild.velocityY).toBeCloseTo(sane.velocityY, 6);
    expect(wild.spinRate).toBeCloseTo(sane.spinRate, 6);
  });

  it('never returns a NaN, however broken the request', () => {
    const broken = resolveShot({
      yaw: Number.NaN,
      power: Number.NaN,
      verticalAim: Number.NaN,
      spin: Number.NaN,
      style: 'normal',
      runSpeed: Number.NaN,
      ballHeight: Number.NaN,
    });
    for (const value of [
      broken.power,
      broken.spinRate,
      broken.velocityX,
      broken.velocityY,
      broken.velocityZ,
      broken.elevation,
      broken.speed,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  /*
   * The launch angle is the whole strike system.
   *
   * It used to be a "lift fraction" added on top of the forward impulse, which
   * meant two things that made the game unaimable: the angle never reached a
   * useful height, and a higher aim also made the shot harder — a full lob
   * left the foot 38% faster than a flat drive from the same charge.
   */
  it('keeps every strike inside a usable launch window', () => {
    for (const style of SHOT_STYLE_ORDER) {
      for (const verticalAim of [-1, -0.5, 0, 0.5, 1]) {
        const shot = resolveShot({ ...base, style, verticalAim });
        expect(degrees(shot.elevation)).toBeGreaterThanOrEqual(
          degrees(GameConfig.kick.minElevation),
        );
        expect(degrees(shot.elevation)).toBeLessThanOrEqual(degrees(GameConfig.kick.maxElevation));
      }
    }
    expect(degrees(GameConfig.kick.minElevation)).toBeCloseTo(5, 6);
    expect(degrees(GameConfig.kick.maxElevation)).toBeCloseTo(50, 6);
  });

  it('separates height from power, so aiming higher is not also hitting harder', () => {
    const flatAim = resolveShot({ ...base, verticalAim: -1 });
    const highAim = resolveShot({ ...base, verticalAim: 1 });
    // The steep one gives up some pace on purpose, and only some: it must
    // never end up faster than the flat one, which is what used to happen.
    expect(highAim.speed).toBeLessThan(flatAim.speed);
    expect(highAim.speed).toBeGreaterThan(flatAim.speed * 0.6);
    expect(highAim.velocityY).toBeGreaterThan(flatAim.velocityY * 5);
  });

  it('aims continuously: higher aim, higher ball, all the way up', () => {
    const angles = [-1, -0.5, 0, 0.5, 1].map(
      (verticalAim) => resolveShot({ ...base, verticalAim }).elevation,
    );
    for (let i = 1; i < angles.length; i += 1) {
      expect(angles[i]!).toBeGreaterThan(angles[i - 1]!);
    }
  });

  it('gives the five styles genuinely different trajectories', () => {
    const shots = Object.fromEntries(
      SHOT_STYLE_ORDER.map((style) => [style, resolveShot({ ...base, style, power: 0.9 })]),
    ) as Record<ShotStyle, ReturnType<typeof resolveShot>>;

    // Flat stays on the deck, lofted really climbs, chip is steepest of all.
    expect(degrees(shots.flat.elevation)).toBeLessThan(15);
    expect(degrees(shots.lofted.elevation)).toBeGreaterThan(30);
    expect(shots.chip.elevation).toBeGreaterThan(shots.lofted.elevation);
    // And a chip can never be hit as hard as a shot.
    expect(shots.chip.speed).toBeLessThan(shots.flat.speed * 0.7);
    expect(shots.chip.power).toBeLessThanOrEqual(GameConfig.kick.styles.chip.powerCap);
    // Selecting the curled shape bends the ball even with no direction asked.
    expect(Math.abs(shots.curled.spinRate)).toBeGreaterThanOrEqual(GameConfig.kick.curlThreshold);
    expect(shots.curled.profile).toBe('curled');
  });

  it('makes a short press a soft ball along the ground, whatever the aim says', () => {
    const tapped = resolveShot({ ...base, power: 1, verticalAim: 1, tap: true });
    expect(tapped.elevation).toBeCloseTo(GameConfig.kick.minElevation, 6);
    expect(tapped.power).toBeLessThanOrEqual(GameConfig.kick.tapPower);
    expect(tapped.speed).toBeLessThan(resolveShot({ ...base, power: 1 }).speed * 0.6);
    expect(tapped.profile).toBe('ground');
  });

  it('calls a ball struck out of the air a volley, and hits it cleaner', () => {
    const grounded = resolveShot({ ...base, ballHeight: 0 });
    const volleyed = resolveShot({ ...base, ballHeight: GameConfig.kick.volleyHeight + 0.2 });
    expect(grounded.profile).not.toBe('volley');
    expect(volleyed.profile).toBe('volley');
    expect(volleyed.speed).toBeGreaterThan(grounded.speed);
    expect(volleyed.elevation).toBeGreaterThan(grounded.elevation);
  });

  it('carries a share of the run, and only a share', () => {
    const standing = resolveShot({ ...base, runSpeed: 0 });
    const running = resolveShot({ ...base, runSpeed: 8 });
    expect(running.speed).toBeGreaterThan(standing.speed);
    expect(running.speed - standing.speed).toBeLessThan(8 * 0.5);
  });

  it('names a chip a chip whatever else is asked for', () => {
    expect(describeShot('chip', 0.05, 1, 30, true)).toBe('chip');
  });

  it('agrees with the preview about where the ball is going', () => {
    for (const style of SHOT_STYLE_ORDER) {
      const shot = resolveShot({ ...base, style, verticalAim: 0.4 });
      expect(shot.elevation).toBeCloseTo(elevationFor(style, 0.4), 10);
    }
  });
});

describe('magnus force', () => {
  it('pushes sideways, never along the flight', () => {
    const bend = magnusAcceleration(20, 0, 18);
    // Flying along +Z with top-down spin: the push is purely on X.
    expect(Math.abs(bend.z)).toBeLessThan(1e-9);
    expect(bend.x).not.toBe(0);
  });

  it('bends the other way for the other spin', () => {
    const right = magnusAcceleration(20, 0, 18);
    const left = magnusAcceleration(-20, 0, 18);
    expect(Math.sign(right.x)).toBe(-Math.sign(left.x));
  });

  it('does nothing to a ball that is not moving', () => {
    const bend = magnusAcceleration(25, 0, 0);
    expect(bend.x).toBeCloseTo(0, 10);
    expect(bend.z).toBeCloseTo(0, 10);
  });

  it('stays well under gravity, so a curl is a bend and not a steer', () => {
    const full = resolveShot({ ...base, power: 1, style: 'curled', spin: 1 });
    const bend = magnusAcceleration(full.spinRate, 0, full.speed);
    expect(Math.abs(bend.x)).toBeLessThan(Math.abs(GameConfig.physics.gravity) * 0.5);
    expect(Math.abs(bend.x)).toBeGreaterThan(1);
  });
});

describe('the flat/high control', () => {
  /*
   * There has to be a shot that goes over things.
   *
   * The control existed but did nothing: the simulation flipped a flag, and
   * the controller's own aim value overwrote it on the very next tick, so
   * every strike came out along the ground however the control was set. These
   * pin the two ends of it down.
   */
  const strike = (verticalAim: number) =>
    resolveShot({ yaw: 0, power: 1, verticalAim, spin: 0, style: 'normal' });

  it('puts a real amount of the strike upwards on the high setting', () => {
    const high = strike(GameConfig.kick.highAim);
    expect(degrees(high.elevation)).toBeGreaterThan(35);
    expect(high.profile).toBe('lofted');
  });

  it('keeps the flat setting flat', () => {
    const flat = strike(GameConfig.kick.flatAim);
    expect(degrees(flat.elevation)).toBeLessThan(10);
    expect(flat.profile).not.toBe('lofted');
  });

  it('separates the two ends by a wide margin, so the control is felt', () => {
    const high = strike(GameConfig.kick.highAim);
    const flat = strike(GameConfig.kick.flatAim);
    expect(high.velocityY).toBeGreaterThan(flat.velocityY * 4);
  });
});
