/** Engine-free math helpers. Everything here is plain data so it can be serialized. */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function copyInto(target: Vec3, source: Vec3): Vec3 {
  target.x = source.x;
  target.y = source.y;
  target.z = source.z;
  return target;
}

export function setVec(target: Vec3, x: number, y: number, z: number): Vec3 {
  target.x = x;
  target.y = y;
  target.z = z;
  return target;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

/** Shortest signed difference between two angles, in radians. */
export function angleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/** Rotates `from` towards `to` by at most `maxStep` radians. */
export function rotateTowards(from: number, to: number, maxStep: number): number {
  const delta = angleDelta(from, to);
  if (Math.abs(delta) <= maxStep) return to;
  return from + Math.sign(delta) * maxStep;
}

/** Yaw angle (radians) of a direction on the XZ plane, 0 = +Z. */
export function yawFromXZ(x: number, z: number): number {
  return Math.atan2(x, z);
}

export function horizontalDistance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function horizontalDistanceSq(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

export function magnitude(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function horizontalMagnitude(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.z * v.z);
}

/** Exponential smoothing that behaves the same at any timestep. */
export function damp(current: number, target: number, smoothing: number, dt: number): number {
  const factor = 1 - Math.pow(1 - clamp(smoothing, 0, 1), dt * 60);
  return current + (target - current) * factor;
}

export function approxEquals(a: number, b: number, epsilon = 1e-6): boolean {
  return Math.abs(a - b) <= epsilon;
}
