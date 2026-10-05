/**
 * World units are metres and seconds. Axes: x = across the table, y = up,
 * z = along the table. Side 0 stands at +z and hits toward -z; side 1 stands at -z.
 * Dimensions follow ITTF regulations.
 */
export const TABLE = {
  length: 2.74,
  width: 1.525,
  height: 0.76,
  thickness: 0.03,
  halfL: 1.37,
  halfW: 0.7625,
} as const;

export const NET = {
  height: 0.1525,
  /** Net extends 15.25 cm beyond each side line. */
  halfWidth: 0.7625 + 0.1525,
  top: 0.76 + 0.1525,
  halfThickness: 0.004,
} as const;

export const BALL = { radius: 0.02, mass: 0.0027 } as const;

export const PADDLE = {
  /** Effective radius of the blade's hitting surface. */
  radius: 0.078,
  /** Default distance of the paddle plane behind the end line. */
  readyZ: TABLE.halfL + 0.3,
  minZ: 0.55,
  maxZ: TABLE.halfL + 1.1,
  minX: -1.25,
  maxX: 1.25,
  minY: TABLE.height + 0.02,
  maxY: TABLE.height + 0.85,
} as const;

export const PHYS = {
  gravity: 9.81,
  /** Quadratic drag coefficient: 0.5*rho*Cd*A/m (rho=1.2, Cd=0.5, A=pi r^2, m=2.7 g). */
  drag: 0.14,
  /** Magnus coefficient: a = k * (w x v). Tuned so 150 rad/s at 8 m/s gives ~6 m/s^2. */
  magnus: 0.005,
  /** Exponential spin decay per second (air torque). */
  spinDecay: 0.35,
  tableRestitution: 0.88,
  tableFriction: 0.22,
  floorRestitution: 0.62,
  floorFriction: 0.3,
  maxSpeed: 40,
  maxSpin: 900,
} as const;

/**
 * Timing. Physics integrates at a fixed 240 Hz so a 40 m/s smash moves at most
 * 17 cm per step; all collisions are additionally swept, so nothing tunnels.
 * The server advances the simulation in 120 Hz ticks (2 physics steps each) and
 * broadcasts snapshots at 60 Hz; clients send input at up to 60 Hz.
 */
export const SIM = {
  dt: 1 / 240,
  stepsPerTick: 2,
  tickRate: 120,
  snapshotRate: 60,
  inputRate: 60,
} as const;

export const RULES = {
  pointsToWin: 11,
  winBy: 2,
  serveSwitchEvery: 2,
  deuceAt: 10,
} as const;

export const TIMING = {
  countdown: 3,
  pointPause: 1.7,
  gamePause: 3.2,
  serveMinHold: 0.45,
  /** Rally safety net: if nothing happens for this long the point is resolved. */
  rallyStall: 6,
} as const;

export type Side = 0 | 1;
export const other = (s: Side): Side => (s === 0 ? 1 : 0);
/** z-direction of a shot hit by `side` (toward the opponent). */
export const dirOut = (s: Side): number => (s === 0 ? -1 : 1);
/** Which half of the table a z-coordinate lies on. */
export const sideOfZ = (z: number): Side => (z >= 0 ? 0 : 1);
