/**
 * What a strike actually does.
 *
 * The client asks: this direction, this style, this much power, this high,
 * this much spin. The server decides, and this is where it decides. Every
 * number that reaches the physics is clamped here, so nothing a client sends
 * can put more than a legal amount of pace on the ball.
 *
 * The model is a launch vector, not a lift fraction. A strike has a speed and
 * an elevation between about 5° and 50°, and the two are independent: aiming
 * higher no longer makes the shot harder, which is what it used to do — the
 * old code added an upward impulse on top of the forward one, so a lofted ball
 * left the foot 38% faster than a flat one and the same charge never produced
 * the same shot twice.
 *
 * Pure functions on plain numbers: no engine types, fully testable, and the
 * same code runs on the server and in the client's prediction.
 */
import { GameConfig, type ShotStyle } from '../config/GameConfig';
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
  /** -1 along the ground to +1 as high as the style allows. Clamped here. */
  verticalAim: number;
  /** -1..1 side spin request. Clamped here. */
  spin: number;
  /** Which of the five shapes the player selected. */
  style: ShotStyle;
  /**
   * Ground speed the striker is carrying, m/s. Running onto a ball adds to it;
   * a share of it, not all of it.
   */
  runSpeed?: number;
  /** Ball height above the surface. Above `kick.volleyHeight` this is a volley. */
  ballHeight?: number;
  /** True when the player asked for a tap rather than a charged strike. */
  tap?: boolean;
}

export interface ResolvedShot {
  /** Velocity the ball leaves with, m/s. */
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  /** Side spin to set, radians per second about Y. */
  spinRate: number;
  /** What this turned out to be, for the animation, the sound and the stats. */
  profile: ShotProfile;
  /** The power actually used, after clamping. */
  power: number;
  /** Launch angle above the ground, radians. Drives the aim preview. */
  elevation: number;
  /** Speed along the launch vector, m/s. */
  speed: number;
}

/** The style table, with an unknown name falling back to the normal strike. */
export function styleProfile(style: ShotStyle) {
  return GameConfig.kick.styles[style] ?? GameConfig.kick.styles.normal;
}

/**
 * Where inside the 5°..50° range a given style and aim put the ball.
 *
 * Exported because the aim preview, the trajectory line and the HUD all have
 * to agree with the strike itself — a preview that draws a different arc from
 * the one the foot produces is worse than no preview.
 */
export function elevationFor(style: ShotStyle, verticalAim: number): number {
  const { kick } = GameConfig;
  const profile = styleProfile(style);
  const aim = clamp(finite(verticalAim, 0), -1, 1);
  // -1..1 onto 0..1 on a curve, not a straight line: fine control near the
  // ground, where the difference between a rolled ball and one that clips the
  // bar is a couple of degrees.
  const swept = Math.pow((aim + 1) / 2, kick.elevationCurve);
  const share = clamp(profile.elevationBias + swept * profile.elevationScale, 0, 1);
  return kick.minElevation + share * (kick.maxElevation - kick.minElevation);
}

/** Turns a request into the velocity the ball leaves the foot with. */
export function resolveShot(request: ShotRequest): ResolvedShot {
  const { kick } = GameConfig;
  const profile = styleProfile(request.style);

  // Coerce before clamping: `clamp` propagates a NaN, and a NaN velocity would
  // put the ball at an undefined position from which nothing recovers. The
  // network layer sanitizes too, but this must be safe on its own — the
  // offline game and the AI reach it without going near a socket.
  const charged = clamp(finite(request.power, kick.minPower), kick.minPower, profile.powerCap);
  const power = request.tap ? Math.min(kick.tapPower, charged) : charged;
  const spin = clamp(finite(request.spin, 0), -1, 1);
  const yaw = finite(request.yaw, 0);
  const runSpeed = Math.max(0, finite(request.runSpeed ?? 0, 0));
  const ballHeight = Math.max(0, finite(request.ballHeight ?? 0, 0));
  const volley = ballHeight >= kick.volleyHeight;

  // A tap is a tap whatever the aim says: the lowest angle in the range, so it
  // goes along the ground rather than wherever the trim wheel was left.
  const elevation = request.tap
    ? kick.minElevation
    : Math.min(
        kick.maxElevation,
        elevationFor(request.style, request.verticalAim) + (volley ? kick.volleyElevationBonus : 0),
      );

  const base = kick.minSpeed + power * (kick.maxSpeed - kick.minSpeed);
  // A steep strike gives up pace: you cannot get a foot right under a ball and
  // swing through it at full speed at the same time.
  const steepness = (elevation - kick.minElevation) / (kick.maxElevation - kick.minElevation || 1);
  const steepLoss = 1 - kick.elevationSpeedFalloff * clamp(steepness, 0, 1);
  const speed =
    base * profile.speedScale * steepLoss * (volley ? kick.volleySpeedScale : 1) +
    runSpeed * kick.runShare;

  const horizontal = speed * Math.cos(elevation);
  // A style with a spin floor always bends the ball: asking for the curled
  // shape and getting a straight one would make the style a label, not a shot.
  const requested =
    Math.abs(spin) >= profile.spinFloor ? spin : Math.sign(spin || 1) * profile.spinFloor;
  const spinRate = requested * kick.maxSpinRate * profile.spinScale;

  return {
    velocityX: Math.sin(yaw) * horizontal,
    velocityY: speed * Math.sin(elevation),
    velocityZ: Math.cos(yaw) * horizontal,
    spinRate,
    profile: describeShot(request.style, elevation, power, spinRate, volley),
    power,
    elevation,
    speed,
  };
}

/**
 * Names the strike after the fact. Order matters: a chip is a chip whatever
 * else is true of it, a ball struck out of the air is a volley, and a ball
 * with real spin on it is a curled one.
 */
export function describeShot(
  style: ShotStyle,
  elevation: number,
  power: number,
  spinRate: number,
  volley: boolean,
): ShotProfile {
  const { kick } = GameConfig;
  if (style === 'chip') return 'chip';
  if (volley) return 'volley';
  if (Math.abs(spinRate) >= kick.curlThreshold) return 'curled';
  if (elevation >= kick.loftedElevation) return 'lofted';
  return power >= kick.drivenPowerThreshold ? 'driven' : 'ground';
}

/**
 * The sideways acceleration spin puts on a moving ball, m/s^2.
 * Lives with the rest of the flight model; re-exported here because the
 * strike and the bend are one subject as far as callers are concerned.
 */
export { magnusAcceleration } from './BallFlight';
