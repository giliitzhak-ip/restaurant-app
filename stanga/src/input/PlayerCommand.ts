/**
 * PlayerCommand — the one and only way anything drives a player.
 *
 * A keyboard profile, a gamepad, a touch pad, the AI and (in stage 3) a network
 * client all produce this exact structure. The simulation consumes nothing else
 * and cannot tell them apart.
 *
 * Edge flags (`shootPressed`, `shootReleased`, `tacklePressed`, `lobToggle`) are
 * true for exactly one tick. Level flags (`shootHeld`, `sprintPressed`) describe
 * the current state of the control.
 */

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

  sprintPressed: boolean;
  /** True on the single tick the shoot control went down. */
  shootPressed: boolean;
  /** True while the shoot control is held. */
  shootHeld: boolean;
  /** True on the single tick the shoot control was released. */
  shootReleased: boolean;
  /** True on the single tick a tackle was requested. */
  tacklePressed: boolean;
  /** True on the single tick the player asked to swap flat/lofted. */
  lobToggle: boolean;
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
    sprintPressed: false,
    shootPressed: false,
    shootHeld: false,
    shootReleased: false,
    tacklePressed: false,
    lobToggle: false,
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
  command.sprintPressed = false;
  command.shootPressed = false;
  command.shootHeld = false;
  command.shootReleased = false;
  command.tacklePressed = false;
  command.lobToggle = false;
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
