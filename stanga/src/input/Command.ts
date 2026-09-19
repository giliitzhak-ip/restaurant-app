/**
 * The one and only way anything drives a player.
 *
 * Local keyboard, touch controls and the AI all produce this exact structure,
 * and the simulation consumes nothing else. When networking lands, remote
 * commands arrive in the same shape and run through the same code path.
 */
import type { Vec3 } from '../core/math';

export interface InputCommand {
  /** Simulation tick this command applies to. */
  tick: number;
  playerId: string;
  /** Desired movement on the ground plane, already camera-relative, length <= 1. */
  moveX: number;
  moveZ: number;
  sprint: boolean;
  /** True while the kick button is held. */
  chargeKick: boolean;
  /** True on the single tick the kick button was released. */
  releaseKick: boolean;
  /** Lofted (chip) rather than flat shot. */
  lofted: boolean;
  /** True on the single tick a tackle was requested. */
  tackle: boolean;
  /** Yaw the player aims at, in radians. Usually derived from the camera. */
  aimYaw: number;
}

export function createCommand(playerId: string, tick = 0): InputCommand {
  return {
    tick,
    playerId,
    moveX: 0,
    moveZ: 0,
    sprint: false,
    chargeKick: false,
    releaseKick: false,
    lofted: false,
    tackle: false,
    aimYaw: 0,
  };
}

export function resetCommand(command: InputCommand, tick: number): InputCommand {
  command.tick = tick;
  command.moveX = 0;
  command.moveZ = 0;
  command.sprint = false;
  command.chargeKick = false;
  command.releaseKick = false;
  command.tackle = false;
  return command;
}

/** Clamps an arbitrary stick input to the unit disc, applying a dead zone. */
export function applyStick(
  command: InputCommand,
  x: number,
  z: number,
  deadZone: number,
): InputCommand {
  const length = Math.sqrt(x * x + z * z);
  if (length <= deadZone) {
    command.moveX = 0;
    command.moveZ = 0;
    return command;
  }
  const normalized = Math.min(1, (length - deadZone) / (1 - deadZone));
  command.moveX = (x / length) * normalized;
  command.moveZ = (z / length) * normalized;
  return command;
}

/** Rotates a camera-space stick vector into world space. */
export function rotateByYaw(x: number, z: number, yaw: number): Vec3 {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  return { x: x * cos + z * sin, y: 0, z: -x * sin + z * cos };
}
