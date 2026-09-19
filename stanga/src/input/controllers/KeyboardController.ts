/**
 * Drives a player from a keyboard profile.
 *
 * Reads the shared KeyboardState rather than attaching its own listeners, so two
 * profiles on one physical keyboard stay in lockstep and edges are never lost.
 */
import { GameConfig } from '../../config/GameConfig';
import type { KeyMap } from '../KeyBindings';
import type { KeyboardState } from '../KeyboardState';
import type { ControlContext, PlayerController } from '../PlayerController';
import { SequenceCounter } from '../PlayerController';
import {
  applyDeadZone,
  createPlayerCommand,
  resetPlayerCommand,
  rotateByYaw,
  type PlayerCommand,
} from '../PlayerCommand';

export class HumanKeyboardController implements PlayerController {
  readonly kind = 'keyboard' as const;
  private readonly command: PlayerCommand;
  private readonly sequence = new SequenceCounter();
  private shootWasHeld = false;
  private sensitivity = 1;

  constructor(
    readonly deviceId: string,
    readonly label: string,
    private keys: KeyMap,
    private readonly keyboard: KeyboardState,
  ) {
    this.command = createPlayerCommand('');
  }

  setKeyMap(keys: KeyMap): void {
    this.keys = keys;
  }

  setSensitivity(value: number): void {
    this.sensitivity = value;
  }

  isConnected(): boolean {
    // A keyboard cannot meaningfully disconnect mid-match in a browser.
    return true;
  }

  reset(): void {
    this.shootWasHeld = false;
    this.sequence.reset();
  }

  poll(playerId: string, tickId: number, context: ControlContext): PlayerCommand {
    const command = this.command;
    command.playerId = playerId;
    resetPlayerCommand(command, tickId, this.sequence.next());

    const heldAny = (codes: string[]) => codes.some((code) => this.keyboard.isHeld(code));
    const pressedAny = (codes: string[]) => codes.some((code) => this.keyboard.wasPressed(code));

    let x = 0;
    let y = 0;
    if (heldAny(this.keys.up)) y += 1;
    if (heldAny(this.keys.down)) y -= 1;
    if (heldAny(this.keys.right)) x += 1;
    if (heldAny(this.keys.left)) x -= 1;

    // Digital keys need no dead zone, but scaling by sensitivity keeps the
    // setting meaningful for players who want a gentler ramp.
    const stick = applyDeadZone(x * this.sensitivity, y * this.sensitivity, 0);
    const world = rotateByYaw(stick.x, stick.y, context.cameraYaw);
    command.moveX = world.x;
    command.moveY = world.z;

    // Steering is how a keyboard player aims, including while charging a shot.
    if (stick.magnitude > 0) {
      command.aimX = world.x;
      command.aimY = world.z;
    }

    command.sprintPressed = heldAny(this.keys.sprint);

    const shootHeld = heldAny(this.keys.shoot);
    command.shootHeld = shootHeld;
    command.shootPressed = shootHeld && !this.shootWasHeld;
    command.shootReleased = !shootHeld && this.shootWasHeld;
    this.shootWasHeld = shootHeld;

    command.tacklePressed = pressedAny(this.keys.tackle);
    command.lobToggle = pressedAny(this.keys.lob);

    return command;
  }

  /** Codes this profile owns, so the page never scrolls while playing. */
  ownedCodes(): string[] {
    return Object.values(this.keys).flat();
  }
}

export const KEYBOARD_DEAD_ZONE = GameConfig.input.deadZone;
