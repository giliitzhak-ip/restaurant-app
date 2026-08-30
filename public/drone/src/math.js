/**
 * math.js — small, allocation-conscious math helpers shared by the whole game.
 * Everything here is pure; no module state.
 */
'use strict';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const mix = lerp;

export function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * (3 - 2 * t);
}

export function invLerp(a, b, v) {
  return clamp01((v - a) / (b - a || 1e-6));
}

/** Frame-rate independent exponential smoothing towards a target. */
export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Shortest-path angular damping. */
export function dampAngle(current, target, lambda, dt) {
  return current + wrapAngle(target - current) * (1 - Math.exp(-lambda * dt));
}

/** Move `current` toward `target` by at most `maxDelta`. */
export function approach(current, target, maxDelta) {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

// ── Minimal vec3 (plain objects; created sparingly, mutated in hot paths) ────
export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const vset = (o, x, y, z) => { o.x = x; o.y = y; o.z = z; return o; };
export const vcopy = (o, a) => { o.x = a.x; o.y = a.y; o.z = a.z; return o; };
export const vadd = (o, a, b) => vset(o, a.x + b.x, a.y + b.y, a.z + b.z);
export const vsub = (o, a, b) => vset(o, a.x - b.x, a.y - b.y, a.z - b.z);
export const vscale = (o, a, s) => vset(o, a.x * s, a.y * s, a.z * s);
export const vaddScaled = (o, a, b, s) => vset(o, a.x + b.x * s, a.y + b.y * s, a.z + b.z * s);
export const vdot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const vlen = (a) => Math.hypot(a.x, a.y, a.z);
export const vlen2 = (a) => a.x * a.x + a.y * a.y + a.z * a.z;
export const vdist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function vcross(o, a, b) {
  const x = a.y * b.z - a.z * b.y;
  const y = a.z * b.x - a.x * b.z;
  const z = a.x * b.y - a.y * b.x;
  return vset(o, x, y, z);
}

export function vnorm(o, a) {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return vset(o, a.x / l, a.y / l, a.z / l);
}

/**
 * Rotate a body-space vector into world space using yaw→pitch→roll (Y-X-Z).
 * Yaw is heading (0 = +Z), pitch is nose-up, roll is right-wing-down.
 */
export function bodyToWorld(out, v, yaw, pitch, roll) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  // roll about Z (forward), then pitch about X (right), then yaw about Y (up)
  const x1 = v.x * cr + v.y * sr;
  const y1 = -v.x * sr + v.y * cr;
  const z1 = v.z;
  const y2 = y1 * cp - z1 * sp;
  const z2 = y1 * sp + z1 * cp;
  const x2 = x1;
  return vset(out, x2 * cy + z2 * sy, y2, -x2 * sy + z2 * cy);
}

// ── Colour helpers ──────────────────────────────────────────────────────────
export const rgb = (r, g, b) =>
  'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
export const rgba = (r, g, b, a) =>
  'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ',' + a.toFixed(3) + ')';

/** Blend two [r,g,b] arrays into `out`. */
export function mixColor(out, a, b, t) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

/**
 * Colour string cache. Building "rgb(...)" strings dominates a 2D-canvas
 * renderer's cost, so quantise to 5-bit channels and memoise.
 */
const colorCache = new Map();
export function cachedRGB(r, g, b) {
  r = r < 0 ? 0 : r > 255 ? 255 : r | 0;
  g = g < 0 ? 0 : g > 255 ? 255 : g | 0;
  b = b < 0 ? 0 : b > 255 ? 255 : b | 0;
  const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
  let s = colorCache.get(key);
  if (s === undefined) {
    s = 'rgb(' + (r & 252) + ',' + (g & 252) + ',' + (b & 252) + ')';
    colorCache.set(key, s);
  }
  return s;
}

/** Deterministic pseudo-random in [0,1) from three integers. */
export function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Mulberry32 — compact seeded PRNG for world generation. */
export function makeRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return String((s / 60) | 0).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
