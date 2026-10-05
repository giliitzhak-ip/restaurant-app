import { BALL, PADDLE, TABLE, dirOut, type Side } from './constants';
import { type BallState, simulate } from './physics';
import { type V3, clamp, v3 } from './vec';

/**
 * Everything a player (human, AI or remote client) can ask of their paddle.
 * The server only ever receives this — never ball positions or scores.
 */
export interface PaddleInput {
  /** Desired paddle position across the table (world x, metres). */
  x: number;
  /** Desired paddle height (world y, metres). */
  y: number;
  /** Face angle, -1 (closed, drives low) .. +1 (open, lifts the ball). */
  tilt: number;
  /** Spin intent: -1 backspin, 0 flat, +1 topspin. */
  spin: number;
  /** Power-shot modifier held. */
  power: boolean;
  /** Serve press counter; a change requests a serve (robust to merged/lost frames). */
  act: number;
}

export interface PaddleState {
  p: V3;
  /** Smoothed paddle velocity (swing), m/s. */
  v: V3;
  tilt: number;
  spin: number;
  power: boolean;
}

/** How much the game helps a given player. */
export interface AssistProfile {
  /** 0..1 blend of the struck ball toward a trajectory that lands on the table. */
  shot: number;
  /** 0..1 blend of the serve toward a legal serve. */
  serve: number;
  /** 0..1 automatic height tracking toward the ball. */
  height: number;
  /** 0..1 automatic lateral tracking toward the ball. */
  lateral: number;
  /** Max centre distance between paddle and ball that still counts as contact. */
  hitRadius: number;
  /** Paddle max speed in x/y (m/s). */
  maxSpeed: number;
  /** Automatic forward/back movement speed (m/s). */
  footwork: number;
  /** Std-dev of random shot error in radians (used by the AI). */
  shotNoise: number;
  /** Paddle ignores a ball that hasn't legally bounced on its side yet (prevents volley faults). */
  onlyAfterBounce: boolean;
}

export const PROFILES = {
  arcade: {
    shot: 0.7,
    serve: 1,
    height: 0.65,
    lateral: 0.3,
    hitRadius: PADDLE.radius + BALL.radius + 0.065,
    maxSpeed: 14,
    footwork: 5,
    shotNoise: 0.015,
    onlyAfterBounce: true,
  },
  advanced: {
    shot: 0.3,
    serve: 0.45,
    height: 0.3,
    lateral: 0,
    hitRadius: PADDLE.radius + BALL.radius + 0.02,
    maxSpeed: 14,
    footwork: 3.6,
    shotNoise: 0.025,
    onlyAfterBounce: false,
  },
} satisfies Record<string, AssistProfile>;

export type AssistMode = keyof typeof PROFILES;

export const homeZ = (side: Side): number => -dirOut(side) * PADDLE.readyZ;
export const READY_Y = TABLE.height + 0.26;

export const newPaddle = (side: Side): PaddleState => ({
  p: v3(0, READY_Y, homeZ(side)),
  v: v3(),
  tilt: 0,
  spin: 0,
  power: false,
});

export const neutralInput = (): PaddleInput => ({ x: 0, y: READY_Y, tilt: 0, spin: 0, power: false, act: 0 });

const finite = (n: unknown, fallback: number): number => (typeof n === 'number' && Number.isFinite(n) ? n : fallback);

/** Clamp an untrusted input into the legal range (used on the server for every message). */
export function sanitizeInput(i: Partial<PaddleInput>): PaddleInput {
  const spin = Math.round(finite(i.spin, 0));
  return {
    x: clamp(finite(i.x, 0), PADDLE.minX, PADDLE.maxX),
    y: clamp(finite(i.y, READY_Y), PADDLE.minY, PADDLE.maxY),
    tilt: clamp(finite(i.tilt, 0), -1, 1),
    spin: spin > 0 ? 1 : spin < 0 ? -1 : 0,
    power: i.power === true,
    act: Math.trunc(finite(i.act, 0)) & 0xffff,
  };
}

export interface Intercept {
  x: number;
  y: number;
  /** Paddle-plane z at contact. */
  z: number;
  /** Seconds from now until contact. */
  t: number;
}

/**
 * Predict where `side` should meet the ball: after it bounces on that side, at the
 * ready line or just after the apex — whichever comes first. Returns null when the
 * ball isn't coming (moving away, going long without bouncing, into the net...).
 */
export function findIntercept(ball: BallState, side: Side, alreadyBounced = false): Intercept | null {
  const s = -dirOut(side); // +1 for side 0 (its half is z > 0)
  if (ball.v.z * s <= 0.05) return null;
  let bounced = alreadyBounced;
  let apexY = -Infinity;
  let result: Intercept | null = null;
  simulate(ball, 2.2, (b, t, evs) => {
    for (const e of evs) {
      if (e.type === 'table') {
        if (e.side === side) {
          if (bounced) return true; // second bounce: too late, keep the last good sample
          bounced = true;
        } else if (bounced) return true;
      } else if (e.type === 'floor' || e.type === 'tableSide') return true;
      else if (e.type === 'net' && !e.cord) return true;
    }
    const zs = b.p.z * s;
    if (!bounced) return zs > TABLE.halfL + 0.15; // passed the end without bouncing
    apexY = Math.max(apexY, b.p.y);
    const descending = b.v.y < 0;
    const sample = {
      x: b.p.x,
      y: b.p.y,
      z: clamp(zs + BALL.radius + 0.01, PADDLE.minZ, PADDLE.maxZ) * s,
      t,
    };
    if (zs >= PADDLE.minZ) result = sample;
    if (zs >= PADDLE.readyZ - 0.05) return true;
    if (descending && b.p.y < apexY - 0.04 && zs >= PADDLE.minZ) return true;
    if (b.p.y < TABLE.height + 0.06 && descending && zs > TABLE.halfL) return true;
    return false;
  });
  if (result && (result as Intercept).y < PADDLE.minY) (result as Intercept).y = PADDLE.minY;
  return result;
}

/**
 * Move the paddle toward the player's requested position. Footwork (forward/back) is
 * automatic; height and lateral position are optionally assisted toward the ball.
 */
export function updatePaddle(
  pad: PaddleState,
  input: PaddleInput,
  intercept: Intercept | null,
  profile: AssistProfile,
  side: Side,
  dt: number,
  servingZ?: number,
): void {
  let tx = input.x;
  let ty = input.y;
  let tz = servingZ ?? homeZ(side);
  if (intercept && servingZ === undefined) {
    // Only start helping once the ball is reasonably close in time.
    const w = clamp(1.25 - intercept.t, 0, 1);
    tx += (intercept.x - tx) * profile.lateral * w;
    ty += (intercept.y - ty) * profile.height * w;
    tz = intercept.z;
  }
  tx = clamp(tx, PADDLE.minX, PADDLE.maxX);
  ty = clamp(ty, PADDLE.minY, PADDLE.maxY);

  const prev = pad.p;
  const dx = tx - prev.x;
  const dy = ty - prev.y;
  const d = Math.hypot(dx, dy);
  const maxStep = profile.maxSpeed * dt;
  const k = d > maxStep ? maxStep / d : 1;
  const dz = tz - prev.z;
  const maxZ = profile.footwork * dt;
  const np = {
    x: prev.x + dx * k,
    y: prev.y + dy * k,
    z: prev.z + clamp(dz, -maxZ, maxZ),
  };
  const a = 1 - Math.exp(-dt / 0.05);
  pad.v = {
    x: pad.v.x + ((np.x - prev.x) / dt - pad.v.x) * a,
    y: pad.v.y + ((np.y - prev.y) / dt - pad.v.y) * a,
    z: pad.v.z + ((np.z - prev.z) / dt - pad.v.z) * a,
  };
  pad.p = np;
  pad.tilt += (input.tilt - pad.tilt) * Math.min(1, dt * 18);
  pad.spin = input.spin;
  pad.power = input.power;
}
