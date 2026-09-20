/**
 * What a strike actually does.
 *
 * The client asks: this direction, this much power, this high, this much spin,
 * maybe a chip. The server decides, and this is where it decides. Every number
 * that reaches the physics is clamped here, so nothing a client sends can put
 * more than a legal amount of force on the ball.
 *
 * Pure functions on plain numbers: no engine types, fully testable, and the
 * same code runs on the server and in the client's prediction.
 */
import { GameConfig } from '../config/GameConfig';
import { clamp } from '../core/math';
import type { ShotProfile } from '../input/PlayerCommand';

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export interface ShotRequest {
  /** Yaw the ball is struck along, radians, 0 = +Z. */
  yaw: number;
  /** Charge at release, 0..1. Clamped here, never trusted. */
  power: number;
  /** -1 along the ground to +1 straight up. Clamped here. */
  verticalAim: number;
  /** -1..1 side spin request. Clamped here. */
  spin: number;
  chipRequested: boolean;
}

export interface ResolvedShot {
  /** Impulse to apply, in newton-seconds. */
  impulseX: number;
  impulseY: number;
  impulseZ: number;
  /** Side spin to set, radians per second about Y. */
  spinRate: number;
  /** What this turned out to be, for the animation, the sound and the stats. */
  profile: ShotProfile;
  /** The power actually used, after clamping. */
  power: number;
}

/**
 * Turns a request into an impulse.
 *
 * The vertical aim maps continuously onto a lift fraction, which is what makes
 * it possible to pick out a crossbar: a toggle can only ever hit two heights.
 */
export function resolveShot(request: ShotRequest): ResolvedShot {
  const { kick } = GameConfig;
  const chip = request.chipRequested;

  // Coerce before clamping: `clamp` propagates a NaN, and a NaN impulse would
  // put the ball at an undefined position from which nothing recovers. The
  // network layer sanitizes too, but this must be safe on its own — the
  // offline game and the AI reach it without going near a socket.
  const power = chip
    ? clamp(finite(request.power, kick.minPower), kick.minPower, kick.chipMaxPower)
    : clamp(finite(request.power, kick.minPower), kick.minPower, 1);
  const vertical = clamp(finite(request.verticalAim, 0), -1, 1);
  const spin = clamp(finite(request.spin, 0), -1, 1);
  const yaw = finite(request.yaw, 0);

  // -1..1 onto minLift..maxLift on a curve, not a straight line. The curve is
  // what gives fine control near the ground, where the difference between a
  // rolled ball and one that clips the bar is a few centimetres of aim, while
  // still reaching a proper lob at the top of the range.
  const aimShare = Math.pow((vertical + 1) / 2, kick.liftCurve);
  const aimedLift = kick.minLift + aimShare * (kick.maxLift - kick.minLift);
  const lift = chip ? kick.chipLift : aimedLift;
  const forward = kick.maxImpulse * power * (chip ? kick.chipForwardScale : 1);

  const spinRate = spin * kick.maxSpinRate;

  return {
    impulseX: Math.sin(yaw) * forward,
    impulseY: forward * lift,
    impulseZ: Math.cos(yaw) * forward,
    spinRate,
    profile: describeShot(lift, power, spinRate, chip),
    power,
  };
}

/**
 * Names the strike after the fact. Order matters: a chip is a chip whatever
 * else is true of it, and a ball with real spin on it is a curled one.
 */
export function describeShot(
  lift: number,
  power: number,
  spinRate: number,
  chipRequested: boolean,
): ShotProfile {
  const { kick } = GameConfig;
  if (chipRequested) return 'chip';
  if (Math.abs(spinRate) >= kick.curlThreshold) return 'curled';
  if (lift >= kick.loftedThreshold) return 'lofted';
  return power >= kick.drivenPowerThreshold ? 'driven' : 'ground';
}

/**
 * The sideways force spin puts on a moving ball.
 *
 * Only the vertical component of the spin is modelled, which is the one that
 * bends a shot left or right; top and back spin would need the full vector and
 * would mostly be invisible on a pitch this size.
 */
export function magnusImpulse(
  spinRateY: number,
  velocityX: number,
  velocityZ: number,
  dt: number,
): { x: number; z: number } {
  const coefficient = GameConfig.kick.magnusCoefficient * spinRateY * dt;
  // omega(0, w, 0) x v(vx, _, vz) = (w*vz, 0, -w*vx)
  return { x: coefficient * velocityZ, z: -coefficient * velocityX };
}
