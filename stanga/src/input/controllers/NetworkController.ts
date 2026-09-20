/**
 * The opponent, on an online client.
 *
 * Stage 2 promised that a network player would plug into the same slot as a
 * keyboard or a gamepad, and this is it: the controller turns the server's
 * report of what the remote player is doing back into a `PlayerCommand`, which
 * is the only language the simulation speaks.
 *
 * Re-deriving intent from the reported velocity — rather than teleporting the
 * body twenty times a second — is what keeps the opponent moving smoothly
 * between snapshots. `OnlineMatch` corrects the resulting drift separately.
 */
import { GameConfig } from '../../config/GameConfig';
import { createPlayerCommand, type PlayerCommand } from '../PlayerCommand';
import type { ControlContext, ControllerKind, PlayerController } from '../PlayerController';

/**
 * How hard a metre of drift pulls the opponent back, in metres per second per
 * metre. High enough to close a gap within a snapshot or two, low enough that
 * the correction is never the thing you see.
 */
const DRIFT_GAIN = 4;

/** What one snapshot says about the remote player. */
export interface RemotePlayerReport {
  /** Where the server says this player is, in world space. */
  positionX: number;
  positionZ: number;
  velocityX: number;
  velocityZ: number;
  facing: number;
  sprinting: boolean;
  charging: boolean;
  /** True on the snapshot where the server said the shot was released. */
  kicked: boolean;
  tackled: boolean;
  connected: boolean;
}

export class NetworkController implements PlayerController {
  readonly kind: ControllerKind = 'network';

  private readonly command: PlayerCommand;
  private sequence = 0;
  private report: RemotePlayerReport = {
    positionX: 0,
    positionZ: 0,
    velocityX: 0,
    velocityZ: 0,
    facing: 0,
    sprinting: false,
    charging: false,
    kicked: false,
    tackled: false,
    connected: true,
  };
  private pendingKick = false;
  private pendingTackle = false;

  constructor(
    readonly deviceId: string,
    readonly label: string,
  ) {
    this.command = createPlayerCommand(deviceId, 0);
  }

  /** Called once per received snapshot. */
  apply(report: RemotePlayerReport): void {
    this.report = report;
    if (report.kicked) this.pendingKick = true;
    if (report.tackled) this.pendingTackle = true;
  }

  poll(playerId: string, tickId: number, context: ControlContext): PlayerCommand {
    this.sequence += 1;
    const command = this.command;
    command.playerId = playerId;
    command.tickId = tickId;
    command.sequenceNumber = this.sequence;

    // Reported motion, plus a pull towards where the server says the player
    // actually is. Steering the drift away through the movement command keeps
    // the opponent inside the physics instead of teleporting them through it.
    let moveX = this.report.velocityX;
    let moveZ = this.report.velocityZ;
    const local = context.player;
    if (local) {
      moveX += (this.report.positionX - local.position.x) * DRIFT_GAIN;
      moveZ += (this.report.positionZ - local.position.z) * DRIFT_GAIN;
    }

    const speed = Math.hypot(moveX, moveZ);
    if (speed > 0.05 && this.report.connected) {
      // Normalize: the command is a direction plus a sprint flag, and the
      // simulation decides how fast that actually is.
      const scale = Math.min(1, speed / GameConfig.player.walkSpeed) / speed;
      command.moveX = moveX * scale;
      command.moveY = moveZ * scale;
    } else {
      command.moveX = 0;
      command.moveY = 0;
    }

    command.aimX = Math.sin(this.report.facing);
    command.aimY = Math.cos(this.report.facing);
    command.sprintPressed = this.report.sprinting;
    command.shootHeld = this.report.charging;
    command.shootPressed = false;
    command.shootReleased = this.pendingKick;
    command.tacklePressed = this.pendingTackle;
    command.lobToggle = false;
    this.pendingKick = false;
    this.pendingTackle = false;
    return command;
  }

  reset(): void {
    this.pendingKick = false;
    this.pendingTackle = false;
    this.report = { ...this.report, velocityX: 0, velocityZ: 0, charging: false };
  }

  isConnected(): boolean {
    return this.report.connected;
  }
}
