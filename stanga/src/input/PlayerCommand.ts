/**
 * PlayerCommand — the one and only way anything drives a player.
 *
 * A keyboard profile, a gamepad, a touch pad, the AI and (in stage 3) a network
 * client all produce this exact structure. The simulation consumes nothing else
 * and cannot tell them apart.
 *
 * Edge flags (`shootPressed`, `shootReleased`, `tacklePressed`) are true for
 * exactly one tick. Level flags (`shootHeld`, `sprintPressed`) describe the
 * current state of the control.
 */
import { SHOT_STYLE_ORDER, type ShotStyle } from '../config/GameConfig';

/**
 * The six shapes a strike can turn out to be.
 *
 * Distinct from `ShotStyle`, which is what the player *selected*: the server
 * works out what the strike actually was from the angle it left at, the pace
 * on it, the spin and whether the ball was in the air. Reporting it back is
 * what lets the animation, the sound and the statistics agree with the physics.
 */
export type ShotProfile = 'ground' | 'driven' | 'lofted' | 'chip' | 'curled' | 'volley';

export interface PlayerCommand {
  /** Simulation tick this command applies to. */
  tickId: number;
  /** Monotonic per-controller counter; a server will use it to order and de-dupe. */
  sequenceNumber: number;
  playerId: string;

  /**
   * Desired movement on the ground plane, in WORLD space, length <= 1.
   * `moveY` is the world Z axis. Controllers convert from their own frame (the
   * camera, for a human) before filling this in, so the simulation never needs
   * to know about a camera — which is exactly what an authoritative server needs.
   */
  moveX: number;
  moveY: number;

  /**
   * Desired facing on the ground plane, in world space. A zero-length vector
   * means "keep the current facing", which avoids a magic angle value.
   */
  aimX: number;
  aimY: number;

  /**
   * How high the strike is aimed, -1 along the ground to +1 straight up.
   * Continuous on purpose: a flat/lofted toggle cannot pick out a crossbar.
   */
  verticalAim: number;
  /** Requested side spin, -1 to +1. A request: the server decides how much. */
  spin: number;
  /** Asks for a chip — a short, steep lift over somebody. */
  chipRequested: boolean;

  sprintPressed: boolean;
  /** True on the single tick the shoot control went down. */
  shootPressed: boolean;
  /** True while the shoot control is held. */
  shootHeld: boolean;
  /** True on the single tick the shoot control was released. */
  shootReleased: boolean;
  /** True on the single tick a tackle was requested. */
  tacklePressed: boolean;
  /**
   * Which of the five shapes the next strike takes.
   *
   * The controls own this, not the simulation: the aim and the style are sent
   * every tick, so anything the simulation flipped was overwritten a tick
   * later. Cycling it is the job of whichever button the device puts it on.
   */
  shotStyle: ShotStyle;
  /** True on the single tick the player asked for the next style. */
  styleCycle: boolean;

  /** True on the single tick the pass control went down. */
  passPressed: boolean;
  /** True while the pass control is held, which asks for a longer ball. */
  passHeld: boolean;
  /** True on the single tick the pass control was released. */
  passReleased: boolean;
  /**
   * Which team-mate the player would like to pass to, by slot index, or -1 for
   * "you choose". A request only: the server picks a legal target and may well
   * pick a different one.
   */
  preferredPassSlot: number;

  /** True on the single tick the player asked to flick the ball up. */
  jugglePressed: boolean;
}

export function createPlayerCommand(playerId: string, tickId = 0): PlayerCommand {
  return {
    tickId,
    sequenceNumber: 0,
    playerId,
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: 0,
    verticalAim: 0,
    spin: 0,
    chipRequested: false,
    sprintPressed: false,
    shootPressed: false,
    shootHeld: false,
    shootReleased: false,
    tacklePressed: false,
    shotStyle: 'normal',
    styleCycle: false,
    passPressed: false,
    passHeld: false,
    passReleased: false,
    preferredPassSlot: -1,
    jugglePressed: false,
  };
}

/** Clears everything for a new tick, keeping the identity of the command. */
export function resetPlayerCommand(
  command: PlayerCommand,
  tickId: number,
  sequenceNumber: number,
): PlayerCommand {
  command.tickId = tickId;
  command.sequenceNumber = sequenceNumber;
  command.moveX = 0;
  command.moveY = 0;
  command.aimX = 0;
  command.aimY = 0;
  command.verticalAim = 0;
  command.spin = 0;
  command.chipRequested = false;
  command.sprintPressed = false;
  command.shootPressed = false;
  command.shootHeld = false;
  command.shootReleased = false;
  command.tacklePressed = false;
  command.shotStyle = 'normal';
  command.styleCycle = false;
  command.passPressed = false;
  command.passHeld = false;
  command.passReleased = false;
  command.preferredPassSlot = -1;
  command.jugglePressed = false;
  return command;
}

/** Structural copy. Used for tests and, later, for network serialization. */
export function clonePlayerCommand(command: PlayerCommand): PlayerCommand {
  return { ...command };
}

/**
 * Normalizes a raw stick reading into the unit disc, applying a dead zone.
 * Returns the resulting magnitude so callers can tell "no input" from "tiny input".
 */
export function applyDeadZone(
  x: number,
  y: number,
  deadZone: number,
): { x: number; y: number; magnitude: number } {
  const length = Math.hypot(x, y);
  if (length <= deadZone || length === 0) {
    return { x: 0, y: 0, magnitude: 0 };
  }
  // Rescale so the stick still reaches 1.0 at full deflection.
  const magnitude = Math.min(1, (length - deadZone) / (1 - deadZone));
  return { x: (x / length) * magnitude, y: (y / length) * magnitude, magnitude };
}

/** Rotates a camera-relative ground vector into world space. */
export function rotateByYaw(x: number, y: number, yaw: number): { x: number; z: number } {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  return { x: x * cos + y * sin, z: -x * sin + y * cos };
}

/** Yaw of a ground vector, 0 = +Z (matching the rest of the simulation). */
export function yawOf(x: number, z: number): number {
  return Math.atan2(x, z);
}

/** The style that follows this one on the cycle control. */
export function nextShotStyle(style: ShotStyle): ShotStyle {
  const index = SHOT_STYLE_ORDER.indexOf(style);
  return SHOT_STYLE_ORDER[(index + 1) % SHOT_STYLE_ORDER.length] ?? 'normal';
}

/** Turns an untrusted style name back into one of the five. */
export function sanitizeShotStyle(raw: unknown): ShotStyle {
  return SHOT_STYLE_ORDER.find((style) => style === raw) ?? 'normal';
}
