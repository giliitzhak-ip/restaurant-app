import { BALL, NET, PHYS, SIM, TABLE, sideOfZ, type Side } from './constants';
import { type V3, clampLen, clone, cross, len, v3 } from './vec';

export interface BallState {
  p: V3;
  v: V3;
  /** Angular velocity (rad/s). */
  w: V3;
}

export type PhysEvent =
  | { type: 'table'; side: Side; x: number; z: number; speed: number }
  | { type: 'tableSide'; speed: number }
  | { type: 'net'; cord: boolean; speed: number }
  | { type: 'floor'; speed: number };

export const cloneBall = (b: BallState): BallState => ({ p: clone(b.p), v: clone(b.v), w: clone(b.w) });
export const restingBall = (): BallState => ({ p: v3(0, TABLE.height + 0.3, 0), v: v3(), w: v3() });

const R = BALL.radius;
const TOP = TABLE.height + R;

/** Gravity + quadratic air drag + Magnus lift. */
export function acceleration(v: V3, w: V3): V3 {
  const sp = len(v);
  const m = cross(w, v);
  return {
    x: -PHYS.drag * sp * v.x + PHYS.magnus * m.x,
    y: -PHYS.gravity - PHYS.drag * sp * v.y + PHYS.magnus * m.y,
    z: -PHYS.drag * sp * v.z + PHYS.magnus * m.z,
  };
}

/**
 * Bounce off a horizontal surface (normal +y) with restitution and Coulomb friction
 * at the contact point. Spin couples to linear velocity: topspin "kicks" forward,
 * backspin checks up. The ball is modelled as a thin shell (I = 2/3 m r^2), so the
 * friction impulse is capped at the value that produces pure rolling (factor 2/5).
 */
export function bounceHorizontal(b: BallState, e: number, mu: number): void {
  const vn = -b.v.y;
  if (vn <= 0) return;
  const ux = b.v.x + R * b.w.z;
  const uz = b.v.z - R * b.w.x;
  const u = Math.hypot(ux, uz);
  b.v.y = vn * e;
  if (u > 1e-6) {
    const k = Math.min((mu * (1 + e) * vn) / u, 0.4);
    const dvx = -k * ux;
    const dvz = -k * uz;
    b.v.x += dvx;
    b.v.z += dvz;
    const f = 3 / (2 * R);
    b.w.x -= f * dvz;
    b.w.z += f * dvx;
  }
  b.w.y *= 0.85;
}

type Hit =
  | { t: number; kind: 'tableTop' | 'tableSide' | 'tableBottom'; axis: 'x' | 'y' | 'z' }
  | { t: number; kind: 'net'; cord: boolean }
  | { t: number; kind: 'floor' };

const BOX_MIN = v3(-TABLE.halfW - R, TABLE.height - TABLE.thickness - R, -TABLE.halfL - R);
const BOX_MAX = v3(TABLE.halfW + R, TOP, TABLE.halfL + R);
const EPS = 1e-7;

/** Swept segment-vs-AABB (slab method). Returns entry fraction and the entry axis. */
function sweepBox(p: V3, d: V3): { t: number; axis: 'x' | 'y' | 'z'; sign: number } | null {
  let tEnter = -Infinity;
  let tExit = Infinity;
  let axis: 'x' | 'y' | 'z' = 'y';
  let sign = 1;
  for (const a of ['x', 'y', 'z'] as const) {
    const lo = BOX_MIN[a];
    const hi = BOX_MAX[a];
    if (Math.abs(d[a]) < 1e-12) {
      if (p[a] < lo || p[a] > hi) return null;
      continue;
    }
    let t1 = (lo - p[a]) / d[a];
    let t2 = (hi - p[a]) / d[a];
    let s = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      s = 1;
    }
    if (t1 > tEnter) {
      tEnter = t1;
      axis = a;
      sign = s;
    }
    tExit = Math.min(tExit, t2);
    if (tEnter > tExit) return null;
  }
  if (tEnter < -EPS || tEnter > 1) return null;
  return { t: Math.max(0, tEnter), axis, sign };
}

function earliestHit(p: V3, v: V3, dt: number): Hit | null {
  const d = { x: v.x * dt, y: v.y * dt, z: v.z * dt };
  let best: Hit | null = null;

  // Table (box expanded by the ball radius). Only consider entry from outside.
  const outside =
    p.x < BOX_MIN.x - EPS || p.x > BOX_MAX.x + EPS ||
    p.y < BOX_MIN.y - EPS || p.y > BOX_MAX.y - EPS ||
    p.z < BOX_MIN.z - EPS || p.z > BOX_MAX.z + EPS;
  if (outside) {
    const s = sweepBox(p, d);
    if (s) {
      const kind = s.axis === 'y' ? (s.sign > 0 ? 'tableTop' : 'tableBottom') : 'tableSide';
      best = { t: s.t * dt, kind, axis: s.axis };
    }
  }

  // Net: two slab faces at z = +-(halfThickness + r).
  const zf = NET.halfThickness + R;
  for (const face of [zf, -zf]) {
    const before = p.z - face;
    const after = p.z + d.z - face;
    const crossing = face > 0 ? before > 0 && after <= 0 : before < 0 && after >= 0;
    if (!crossing) continue;
    const f = before / (before - after);
    const y = p.y + d.y * f;
    const x = p.x + d.x * f;
    if (Math.abs(x) <= NET.halfWidth + R * 0.5 && y <= NET.top + R && y >= TABLE.height) {
      const t = f * dt;
      if (!best || t < best.t) best = { t, kind: 'net', cord: y > NET.top - R * 0.7 };
    }
  }

  // Floor.
  if (p.y > R && p.y + d.y <= R) {
    const t = ((p.y - R) / (p.y - (p.y + d.y))) * dt;
    if (!best || t < best.t) best = { t, kind: 'floor' };
  }
  return best;
}

function resolve(hit: Hit, b: BallState, events: PhysEvent[]): void {
  const speed = len(b.v);
  switch (hit.kind) {
    case 'tableTop': {
      // Rolling contact: no bounce event, just keep it on the surface.
      if (-b.v.y < 0.06) {
        b.v.y = 0;
        b.p.y = TOP + 1e-6;
        return;
      }
      events.push({ type: 'table', side: sideOfZ(b.p.z), x: b.p.x, z: b.p.z, speed });
      bounceHorizontal(b, PHYS.tableRestitution, PHYS.tableFriction);
      b.p.y = TOP + 1e-6;
      return;
    }
    case 'tableBottom':
      b.v.y = -Math.abs(b.v.y) * 0.3;
      return;
    case 'tableSide': {
      events.push({ type: 'tableSide', speed });
      const a = hit.axis as 'x' | 'z';
      b.v[a] = -b.v[a] * 0.45;
      // Nudge out of the face so we don't re-detect it.
      b.p[a] += Math.sign(b.v[a]) * 1e-5;
      return;
    }
    case 'net': {
      events.push({ type: 'net', cord: hit.cord, speed });
      if (hit.cord) {
        // Ball clips the top of the net: loses pace and pops up, then continues.
        b.v.z *= 0.55;
        b.v.x *= 0.85;
        b.v.y = Math.max(b.v.y * 0.4, 0) + 0.5;
        b.w.x *= 0.5;
        b.w.z *= 0.5;
        b.p.z += Math.sign(b.v.z) * 1e-5;
      } else {
        // Ball hits the mesh: the net absorbs almost all of it.
        b.v.z = -b.v.z * 0.12;
        b.v.x *= 0.3;
        b.v.y *= 0.3;
        b.w = { x: b.w.x * 0.2, y: b.w.y * 0.2, z: b.w.z * 0.2 };
        b.p.z += Math.sign(b.v.z || 1) * 1e-5;
      }
      return;
    }
    case 'floor': {
      if (-b.v.y > 0.1) events.push({ type: 'floor', speed });
      bounceHorizontal(b, PHYS.floorRestitution, PHYS.floorFriction);
      if (b.v.y < 0.1) b.v.y = 0;
      b.p.y = R + 1e-6;
      return;
    }
  }
}

/**
 * Advance the ball by `dt` (semi-implicit Euler for forces) and resolve every
 * collision along the swept path in time order, so even a 40 m/s ball can never
 * pass through the table, the net or the floor.
 */
export function stepBall(b: BallState, dt: number, events: PhysEvent[]): void {
  const a = acceleration(b.v, b.w);
  b.v = clampLen({ x: b.v.x + a.x * dt, y: b.v.y + a.y * dt, z: b.v.z + a.z * dt }, PHYS.maxSpeed);
  // A ball resting on the table/floor shouldn't sink under gravity.
  const onTable = Math.abs(b.p.y - TOP) < 1e-4 && Math.abs(b.p.x) <= TABLE.halfW && Math.abs(b.p.z) <= TABLE.halfL;
  if ((onTable || b.p.y <= R + 1e-4) && b.v.y < 0 && b.v.y > -0.06) b.v.y = 0;
  const decay = Math.exp(-PHYS.spinDecay * dt);
  b.w = clampLen({ x: b.w.x * decay, y: b.w.y * decay, z: b.w.z * decay }, PHYS.maxSpin);

  let remaining = dt;
  for (let i = 0; i < 5 && remaining > 1e-9; i++) {
    const hit = earliestHit(b.p, b.v, remaining);
    if (!hit) {
      b.p = { x: b.p.x + b.v.x * remaining, y: b.p.y + b.v.y * remaining, z: b.p.z + b.v.z * remaining };
      return;
    }
    b.p = { x: b.p.x + b.v.x * hit.t, y: b.p.y + b.v.y * hit.t, z: b.p.z + b.v.z * hit.t };
    remaining -= hit.t;
    resolve(hit, b, events);
  }
  // Rolling/rest contact: physical friction slows a ball rolling on a surface.
  if (b.v.y === 0) {
    const f = Math.exp(-0.6 * dt);
    b.v.x *= f;
    b.v.z *= f;
  }
}

/**
 * Simulate forward from `start` (not mutated). `visit` is called after every step
 * with the state, elapsed time and the events of that step; return true to stop.
 */
export function simulate(
  start: BallState,
  maxT: number,
  visit: (b: BallState, t: number, events: PhysEvent[]) => boolean,
  dt: number = SIM.dt,
): BallState {
  const b = cloneBall(start);
  const events: PhysEvent[] = [];
  let t = 0;
  while (t < maxT) {
    events.length = 0;
    stepBall(b, dt, events);
    t += dt;
    if (visit(b, t, events)) break;
  }
  return b;
}

/**
 * Swept ball-vs-paddle test over one step. The paddle face is a disc whose plane is
 * perpendicular to z; both the ball and the paddle move during the step, so we test
 * the relative motion. Returns the contact fraction in [0,1] or null.
 */
export function sweepPaddle(
  ball0: V3,
  ball1: V3,
  pad0: V3,
  pad1: V3,
  side: Side,
  hitRadius: number,
): number | null {
  const s = side === 0 ? -1 : 1; // direction the paddle faces (toward the opponent)
  const d0 = (ball0.z - pad0.z) * s;
  const d1 = (ball1.z - pad1.z) * s;
  // Ball must be in front of (or just at) the face and approaching it.
  if (d0 < -0.03 || d1 > R || d0 <= d1) return null;
  const t = Math.min(1, Math.max(0, (d0 - R) / (d0 - d1)));
  const rx = ball0.x + (ball1.x - ball0.x) * t - (pad0.x + (pad1.x - pad0.x) * t);
  const ry = ball0.y + (ball1.y - ball0.y) * t - (pad0.y + (pad1.y - pad0.y) * t);
  return Math.hypot(rx, ry) <= hitRadius ? t : null;
}
