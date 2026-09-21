/**
 * How the ball moves through the air and along the ground.
 *
 * One model, three readers. The simulation applies it to the physics body,
 * the opponent uses it to work out where the ball is going to be, and the aim
 * preview uses it to draw the arc the player is about to hit. A preview that
 * disagreed with the strike would be worse than no preview at all, and an
 * opponent predicting against different numbers would run to the wrong place.
 *
 * Pure functions on plain numbers: no engine types, no state.
 */
import { GameConfig } from '../config/GameConfig';
import { clamp, type Vec3 } from '../core/math';
import type { BallState } from './MatchState';

/**
 * Fraction of the velocity that survives one step of air drag.
 * Quadratic in the speed, which is what takes the edge off a hard shot over a
 * long flight while letting a floated one hang.
 */
export function airDragFactor(speed: number, dt: number): number {
  return Math.max(0, 1 - GameConfig.ball.airDrag * speed * dt);
}

/** Fraction of the ground-plane velocity that survives one step of rolling. */
export function rollingFactor(dt: number): number {
  return Math.max(0, 1 - GameConfig.ball.rollingResistance * dt);
}

/** The sideways acceleration side spin puts on a moving ball, m/s^2. */
export function magnusAcceleration(
  spinRateY: number,
  velocityX: number,
  velocityZ: number,
): { x: number; z: number } {
  const coefficient = GameConfig.kick.magnusCoefficient * spinRateY;
  // omega(0, w, 0) x v(vx, _, vz) = (w*vz, 0, -w*vx)
  return { x: coefficient * velocityZ, z: -coefficient * velocityX };
}

/** A position and velocity being integrated forward. Mutated in place. */
export interface FlightState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
}

/**
 * Advances a flight by one step.
 *
 * Deliberately simpler than the simulation, which has Havok underneath it for
 * the bounce and the surface friction: this is the free-flight part only, and
 * a ball that reaches the ground is flattened onto it rather than bounced.
 * Good enough to predict with, and never used to decide anything.
 */
export function advanceFlight(flight: FlightState, dt: number): void {
  const { ball, physics } = GameConfig;
  const speed = Math.hypot(flight.vx, flight.vy, flight.vz);
  const drag = airDragFactor(speed, dt);
  flight.vx *= drag;
  flight.vy *= drag;
  flight.vz *= drag;

  if (flight.y > ball.airborneHeight) {
    flight.vy += physics.gravity * dt;
    if (Math.abs(flight.spin) > 0.5) {
      const bend = magnusAcceleration(flight.spin, flight.vx, flight.vz);
      flight.vx += bend.x * dt;
      flight.vz += bend.z * dt;
      flight.spin *= Math.max(0, 1 - ball.spinDecay * dt);
    }
  } else {
    const roll = rollingFactor(dt);
    flight.vx *= roll;
    flight.vz *= roll;
    if (flight.vy < 0) flight.vy = 0;
  }

  flight.x += flight.vx * dt;
  flight.y = Math.max(ball.radius, flight.y + flight.vy * dt);
  flight.z += flight.vz * dt;
}

/**
 * Where the ball will be in `seconds`, given how it is moving now.
 *
 * Coarse on purpose: this is a guess about the future, and spending a hundred
 * steps on it would buy nothing. The result is kept on the pitch, because a
 * prediction that leaves it would send a player running at the fence.
 */
export function predictBall(ball: BallState, seconds: number, steps = 6): Vec3 {
  const flight: FlightState = {
    x: ball.position.x,
    y: ball.position.y,
    z: ball.position.z,
    vx: ball.velocity.x,
    vy: ball.velocity.y,
    vz: ball.velocity.z,
    spin: 0,
  };
  const dt = seconds / Math.max(1, steps);
  for (let i = 0; i < steps; i += 1) advanceFlight(flight, dt);

  const halfWidth = GameConfig.field.width / 2 - GameConfig.ball.radius;
  const halfLength = GameConfig.field.length / 2 + GameConfig.goal.depth;
  return {
    x: clamp(flight.x, -halfWidth, halfWidth),
    y: flight.y,
    z: clamp(flight.z, -halfLength, halfLength),
  };
}

/**
 * Fills `out` with the path a ball would take, and returns how many points it
 * used. The array is supplied by the caller and reused, so drawing the preview
 * every frame allocates nothing.
 */
export function sampleFlight(
  origin: Vec3,
  velocityX: number,
  velocityY: number,
  velocityZ: number,
  spin: number,
  seconds: number,
  out: Vec3[],
): number {
  const flight: FlightState = {
    x: origin.x,
    y: origin.y,
    z: origin.z,
    vx: velocityX,
    vy: velocityY,
    vz: velocityZ,
    spin,
  };
  const points = out.length;
  if (points === 0) return 0;
  const dt = seconds / (points - 1 || 1);

  const first = out[0];
  if (first) {
    first.x = flight.x;
    first.y = flight.y;
    first.z = flight.z;
  }

  for (let i = 1; i < points; i += 1) {
    advanceFlight(flight, dt);
    const point = out[i];
    if (!point) break;
    point.x = flight.x;
    point.y = flight.y;
    point.z = flight.z;
    // Stop at the first bounce: a preview is about the ball leaving the foot,
    // not about where it ends up three bounces later.
    if (flight.y <= GameConfig.ball.radius + 1e-3 && i > 1) return i + 1;
  }
  return points;
}
