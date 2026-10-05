import { BALL, NET, PHYS, TABLE, dirOut, type Side } from './constants';
import type { AssistProfile, PaddleInput, PaddleState } from './paddle';
import { type BallState, simulate } from './physics';
import type { Rng } from './rng';
import { type V3, clamp, cross, len, lerp, norm, v3 } from './vec';

const TOP = TABLE.height + BALL.radius;
const UP = v3(0, 1, 0);

/** Build an angular velocity from topspin (+) / backspin (-) and sidespin amounts. */
export function spinVector(v: V3, top: number, side: number): V3 {
  const axis = norm(cross(UP, v3(v.x, 0, v.z)));
  return { x: axis.x * top, y: side, z: axis.z * top };
}

/** Topspin component of `w` relative to the direction of travel `v` (rad/s). */
export function topspinOf(v: V3, w: V3): number {
  const axis = norm(cross(UP, v3(v.x, 0, v.z)));
  return axis.x * w.x + axis.z * w.z;
}

export interface Landing {
  /** First point where the ball comes down through table height. */
  x: number;
  z: number;
  t: number;
  /** Ball centre height minus net top when crossing z = 0 (NaN if it never crossed). */
  netClear: number;
  hitNet: boolean;
  onTable: boolean;
}

/** Fly the ball (no paddles) until it first comes down to table height. */
export function landingOf(p: V3, v: V3, w: V3, maxT = 2.5): Landing {
  const res: Landing = { x: NaN, z: NaN, t: maxT, netClear: NaN, hitNet: false, onTable: false };
  let prevZ = p.z;
  let prevY = p.y;
  simulate({ p, v, w }, maxT, (b, t, evs) => {
    if (Math.sign(prevZ) !== Math.sign(b.p.z) && Number.isNaN(res.netClear)) {
      res.netClear = (prevY + b.p.y) / 2 - NET.top;
    }
    prevZ = b.p.z;
    prevY = b.p.y;
    for (const e of evs) {
      if (e.type === 'net') res.hitNet = true;
      if (e.type === 'table') {
        res.x = e.x;
        res.z = e.z;
        res.t = t;
        res.onTable = true;
        return true;
      }
      if (e.type === 'floor' || e.type === 'tableSide') {
        if (Number.isNaN(res.x)) {
          res.x = b.p.x;
          res.z = b.p.z;
          res.t = t;
        }
        return true;
      }
    }
    // Came down through table height outside the table.
    if (b.v.y < 0 && b.p.y <= TOP && Number.isNaN(res.x)) {
      res.x = b.p.x;
      res.z = b.p.z;
      res.t = t;
      return true;
    }
    return false;
  });
  return res;
}

/** Legal landing zone on the half of the table that `hitter` is aiming at. */
export function inTargetZone(side: Side, x: number, z: number, margin = 0): boolean {
  const d = dirOut(side);
  return Math.abs(x) <= TABLE.halfW - margin && z * d >= margin && z * d <= TABLE.halfL - margin;
}

/**
 * Shooting method: find a velocity with horizontal speed ~hSpeed (reduced if needed
 * to clear the net) that lands at (tx, tz) under full drag + Magnus physics.
 */
export function solveToTarget(
  from: V3,
  tx: number,
  tz: number,
  hSpeed: number,
  top: number,
  sideSpin: number,
  needNet: boolean,
): { v: V3; w: V3; err: number; ok: boolean } {
  let best = { v: v3(0, 1, 0), w: v3(), err: Infinity, ok: false };
  let h = Math.max(1.5, hSpeed);
  for (let attempt = 0; attempt < 7; attempt++) {
    const dx0 = tx - from.x;
    const dz0 = tz - from.z;
    const dist = Math.max(0.05, Math.hypot(dx0, dz0));
    let heading = Math.atan2(dx0, dz0);
    const t0 = dist / h;
    let vy = (TOP - from.y) / t0 + 0.5 * PHYS.gravity * t0;
    let v = v3();
    let w = v3();
    let land: Landing | null = null;
    for (let it = 0; it < 10; it++) {
      v = v3(Math.sin(heading) * h, vy, Math.cos(heading) * h);
      w = spinVector(v, top, sideSpin);
      land = landingOf(from, v, w);
      if (Number.isNaN(land.x) || land.hitNet) {
        vy += 0.5;
        continue;
      }
      const ex = tx - land.x;
      const ez = tz - land.z;
      const along = ex * Math.sin(heading) + ez * Math.cos(heading);
      const lateral = ex * Math.cos(heading) - ez * Math.sin(heading);
      if (Math.hypot(ex, ez) < 0.015) break;
      vy += along * (PHYS.gravity / (2 * h)) * 0.9;
      heading += lateral / dist;
    }
    if (!land || Number.isNaN(land.x)) {
      h *= 0.85;
      continue;
    }
    const err = Math.hypot(tx - land.x, tz - land.z);
    const netOk = !needNet || (!land.hitNet && (Number.isNaN(land.netClear) || land.netClear > BALL.radius + 0.015));
    const ok = netOk && err < 0.06;
    if (ok || (netOk && !best.ok && err < best.err) || (!best.ok && best.err === Infinity)) {
      best = { v, w, err, ok };
    }
    if (ok) return best;
    h *= 0.87;
  }
  return best;
}

export interface ShotResult {
  v: V3;
  w: V3;
  /** Normalised power 0..1 (for sound/FX). */
  power: number;
}

/** Shared mapping from swing + modifiers to a 0..1 power value. */
function powerOf(pad: PaddleState, input: PaddleInput): number {
  const swing = Math.hypot(pad.v.x, pad.v.y);
  return clamp(0.32 + clamp(swing / 5, 0, 0.33) + (input.power ? 0.35 : 0), 0, 1);
}

function applyNoise(v: V3, noise: number, rng: Rng | null): V3 {
  if (!rng || noise <= 0) return v;
  const h = Math.hypot(v.x, v.z);
  const heading = Math.atan2(v.x, v.z) + rng.gauss(noise);
  const elev = Math.atan2(v.y, h) + rng.gauss(noise * 0.6);
  const s = len(v) * (1 + rng.gauss(noise * 0.5));
  return v3(Math.sin(heading) * Math.cos(elev) * s, Math.sin(elev) * s, Math.cos(heading) * Math.cos(elev) * s);
}

/** Rotate a velocity's elevation angle by `d` radians, keeping its speed and heading. */
function pitchBy(v: V3, d: number): V3 {
  const h = Math.hypot(v.x, v.z);
  const s = len(v);
  const e = clamp(Math.atan2(v.y, h) + d, -1.2, 1.3);
  const k = h > 1e-6 ? (Math.cos(e) * s) / h : 0;
  return v3(v.x * k, Math.sin(e) * s, v.z * k);
}

/**
 * The stroke model. A neutral stroke (flat face, centred contact) sends the ball on
 * a natural arc whose pace and depth grow with swing speed and the power key. The
 * player then shapes it:
 *  - face angle (tilt) opens/closes the launch angle -> high/long or low/into the net,
 *  - lateral swing and off-centre contact angle the ball left/right (and can go wide),
 *  - spin intent plus vertical brushing produce topspin (dips, kicks) or backspin
 *    (floats, checks); incoming spin kicks the ball up (topspin) or down (backspin)
 *    off the face, so it must be compensated with the tilt,
 *  - contact below net height needs an open face.
 * The assist then blends the raw velocity toward one that lands on the table:
 * strongly in Arcade, lightly in Advanced, so errors stay possible.
 */
export function computeShot(
  ball: BallState,
  side: Side,
  pad: PaddleState,
  input: PaddleInput,
  profile: AssistProfile,
  rng: Rng | null,
): ShotResult {
  const dir = dirOut(side);
  const p = powerOf(pad, input);
  const vinSpeed = len(ball.v);
  const spinIn = topspinOf(ball.v, ball.w);

  let h = 3.9 + 7.4 * p + 0.1 * vinSpeed;
  if (input.spin > 0) h *= 1.05;
  if (input.spin < 0) h *= 0.8;
  const top = input.spin * (85 + 140 * p) + clamp(pad.v.y, -4, 4) * 16;
  const sideSpin = clamp(pad.v.x, -5, 5) * 7;

  const offX = ball.p.x - pad.p.x;
  const lateral = clamp(pad.v.x * 0.07 + offX * 2.2 - pad.p.x * 0.1, -0.55, 0.55);
  const depth = clamp(0.5 + 0.62 * p + (input.spin > 0 ? 0.06 : 0) - (input.spin < 0 ? 0.08 : 0), 0.35, 1.2);
  const tz = dir * depth;
  const tx = ball.p.x + Math.tan(lateral) * Math.abs(tz - ball.p.z);

  const natural = solveToTarget(ball.p, tx, tz, h, top, sideSpin, true);
  const lowContact = Math.max(0, NET.top - ball.p.y);
  const deviation = pad.tilt * 0.3 + spinIn * 0.0009 - lowContact * 0.9;
  const raw = pitchBy(natural.v, deviation);

  let v = raw;
  if (profile.shot > 0) {
    const m = 0.1;
    const cx = clamp(tx, -TABLE.halfW + m, TABLE.halfW - m);
    const ideal = cx === tx && natural.ok ? natural : solveToTarget(ball.p, cx, tz, h, top, sideSpin, true);
    v = lerp(raw, ideal.v, profile.shot);
  }
  // Fast or heavily spun incoming balls are harder to control.
  const pressure = 1 + Math.max(0, vinSpeed - 6) * 0.12 + Math.abs(spinIn) * 0.002;
  v = applyNoise(v, profile.shotNoise * pressure, rng);
  return { v, w: spinVector(v, top, sideSpin), power: p };
}

/**
 * Serve: the ball must bounce on the server's half first, then the receiver's.
 * The raw serve aims a fixed first-bounce point at the chosen pace; the assist
 * searches for first-bounce point/pace combinations that make the serve legal and
 * land close to where the player aimed (lateral position + tilt for depth).
 */
export function computeServe(
  ballPos: V3,
  side: Side,
  pad: PaddleState,
  input: PaddleInput,
  profile: AssistProfile,
  rng: Rng | null,
): ShotResult {
  const dir = dirOut(side);
  const p = powerOf(pad, input);
  const h = 3.4 + 3.4 * p;
  const top = input.spin * (60 + 90 * p) + clamp(pad.v.y, -4, 4) * 10;
  const sideSpin = clamp(pad.v.x, -5, 5) * 6;
  const targetX = clamp(pad.p.x * 0.75 + pad.v.x * 0.12, -0.6, 0.6);
  const targetDepth = 0.5 + 0.38 * (input.tilt + 1); // 0.5 .. 1.26 on the receiver's half

  const firstBounce = (depthOwn: number, hs: number) =>
    solveToTarget(ballPos, ballPos.x + (targetX - ballPos.x) * 0.35, -dir * depthOwn, hs, top, sideSpin, false);

  const raw = firstBounce(1.0, h);
  let v = raw.v;
  if (profile.serve > 0) {
    const rawResult = serveOutcome(ballPos, raw.v, raw.w, side);
    if (!rawResult.legal || profile.serve >= 1) {
      let bestScore = Infinity;
      let best = raw.v;
      for (const depthOwn of [0.8, 0.95, 1.1, 1.25]) {
        for (const hs of [h, h * 0.85, h * 1.15, h * 1.3]) {
          const c = firstBounce(depthOwn, hs);
          const out = serveOutcome(ballPos, c.v, c.w, side);
          if (!out.legal || out.clearance < 0.035) continue;
          const score =
            Math.abs(out.z * dir - targetDepth) + Math.abs(out.x - targetX) * 0.6 + Math.abs(hs - h) * 0.05;
          if (score < bestScore) {
            bestScore = score;
            best = c.v;
          }
        }
      }
      if (bestScore < Infinity) v = lerp(raw.v, best, profile.serve);
    }
  }
  v = applyNoise(v, profile.shotNoise * 0.35, rng);
  return { v, w: spinVector(v, top, sideSpin), power: p };
}

/** Simulate a serve to its second bounce and report whether it is legal. */
export function serveOutcome(
  from: V3,
  v: V3,
  w: V3,
  side: Side,
): { legal: boolean; x: number; z: number; net: boolean; clearance: number } {
  let bounces = 0;
  let clearance = Infinity;
  let prevZ = from.z;
  let legal = false;
  let net = false;
  let x = NaN;
  let z = NaN;
  simulate({ p: from, v, w }, 3, (b, _t, evs) => {
    if (Math.sign(prevZ) !== Math.sign(b.p.z)) clearance = Math.min(clearance, b.p.y - NET.top - BALL.radius);
    prevZ = b.p.z;
    for (const e of evs) {
      if (e.type === 'net') net = true;
      if (e.type === 'table') {
        bounces++;
        if (bounces === 1 && e.side !== side) return true;
        if (bounces === 2) {
          legal = e.side !== side && !net;
          x = e.x;
          z = e.z;
          return true;
        }
      }
      if (e.type === 'floor' || e.type === 'tableSide') return true;
    }
    return false;
  });
  return { legal, x, z, net, clearance };
}
