/**
 * Drives a player from a standard-layout gamepad.
 *
 * Mapping (standard gamepad):
 *   Left stick  — movement          Right stick — aim
 *   A / Cross   — shoot (hold+release)
 *   X / Square  — tackle            Y / Triangle — flat / lofted
 *   Right trigger — sprint          Start — pause
 */
import { GameConfig } from '../../config/GameConfig';
import type { ControlContext, PlayerController } from '../PlayerController';
import { SequenceCounter } from '../PlayerController';
import {
  applyDeadZone,
  createPlayerCommand,
  resetPlayerCommand,
  rotateByYaw,
  type PlayerCommand,
} from '../PlayerCommand';

/** Standard gamepad button indices, named so the mapping reads clearly. */
export const GamepadButton = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LeftBumper: 4,
  RightBumper: 5,
  LeftTrigger: 6,
  RightTrigger: 7,
  Select: 8,
  Start: 9,
  LeftStick: 10,
  RightStick: 11,
  DpadUp: 12,
  DpadDown: 13,
  DpadLeft: 14,
  DpadRight: 15,
} as const;

/** Any button that counts as "I am joining" on the device-assignment screen. */
export const JOIN_BUTTONS: readonly number[] = [
  GamepadButton.A,
  GamepadButton.B,
  GamepadButton.X,
  GamepadButton.Y,
  GamepadButton.Start,
];

export function readGamepads(): (Gamepad | null)[] {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    return [];
  }
  try {
    return Array.from(navigator.getGamepads());
  } catch {
    return [];
  }
}

/** A pad is "standard" when the browser could map it; otherwise indices may differ. */
export function describeGamepad(pad: Gamepad, fallbackIndex: number): string {
  const raw = pad.id?.trim();
  if (!raw) return `בקר ${fallbackIndex + 1}`;
  // Strip the vendor/product ids browsers append, they are noise for a player.
  const cleaned = raw.replace(/\s*\((?:Vendor|STANDARD GAMEPAD).*?\)\s*/gi, '').trim();
  return cleaned.length > 0 ? cleaned.slice(0, 32) : `בקר ${fallbackIndex + 1}`;
}

export class HumanGamepadController implements PlayerController {
  readonly kind = 'gamepad' as const;
  private readonly command: PlayerCommand;
  private readonly sequence = new SequenceCounter();
  private shootWasHeld = false;
  private lobWasHeld = false;
  private tackleWasHeld = false;
  private startWasHeld = false;
  private deadZone: number = GameConfig.input.deadZone;
  private connected = true;

  constructor(
    readonly deviceId: string,
    readonly label: string,
    /** Index into navigator.getGamepads(). Re-resolved by gamepad id on reconnect. */
    private padIndex: number,
    private readonly onPause?: () => void,
  ) {
    this.command = createPlayerCommand('');
  }

  setDeadZone(value: number): void {
    this.deadZone = value;
  }

  /** Re-points this controller at a pad slot after a reconnect. */
  rebind(padIndex: number): void {
    this.padIndex = padIndex;
    this.connected = true;
    this.reset();
  }

  get index(): number {
    return this.padIndex;
  }

  isConnected(): boolean {
    const pad = readGamepads()[this.padIndex];
    this.connected = Boolean(pad?.connected);
    return this.connected;
  }

  reset(): void {
    this.shootWasHeld = false;
    this.lobWasHeld = false;
    this.tackleWasHeld = false;
    this.startWasHeld = false;
    this.sequence.reset();
  }

  poll(playerId: string, tickId: number, context: ControlContext): PlayerCommand {
    const command = this.command;
    command.playerId = playerId;
    resetPlayerCommand(command, tickId, this.sequence.next());

    const pad = readGamepads()[this.padIndex];
    if (!pad?.connected) {
      this.connected = false;
      // A dropped pad must not leave a shot charged forever.
      command.shootReleased = this.shootWasHeld;
      this.shootWasHeld = false;
      return command;
    }
    this.connected = true;

    const axis = (index: number) => pad.axes[index] ?? 0;
    const pressed = (index: number) => Boolean(pad.buttons[index]?.pressed);
    const value = (index: number) => pad.buttons[index]?.value ?? 0;

    // Gamepad Y is inverted relative to our forward axis.
    let rawX = axis(0);
    let rawY = -axis(1);

    // D-pad acts as a digital fallback for pads with a poor analogue stick.
    if (pressed(GamepadButton.DpadUp)) rawY = 1;
    if (pressed(GamepadButton.DpadDown)) rawY = -1;
    if (pressed(GamepadButton.DpadLeft)) rawX = -1;
    if (pressed(GamepadButton.DpadRight)) rawX = 1;

    const move = applyDeadZone(rawX, rawY, this.deadZone);
    const worldMove = rotateByYaw(move.x, move.y, context.cameraYaw);
    command.moveX = worldMove.x;
    command.moveY = worldMove.z;

    const aim = applyDeadZone(axis(2), -axis(3), this.deadZone);
    if (aim.magnitude > 0) {
      const worldAim = rotateByYaw(aim.x, aim.y, context.cameraYaw);
      command.aimX = worldAim.x;
      command.aimY = worldAim.z;
    } else if (move.magnitude > 0) {
      // No right stick input: aim where you run, like the keyboard.
      command.aimX = worldMove.x;
      command.aimY = worldMove.z;
    }

    // Triggers report analogue pressure on most pads and a plain press on others.
    command.sprintPressed =
      value(GamepadButton.RightTrigger) > 0.35 || pressed(GamepadButton.RightBumper);

    const shootHeld = pressed(GamepadButton.A) || value(GamepadButton.A) > 0.5;
    command.shootHeld = shootHeld;
    command.shootPressed = shootHeld && !this.shootWasHeld;
    command.shootReleased = !shootHeld && this.shootWasHeld;
    this.shootWasHeld = shootHeld;

    const tackleHeld = pressed(GamepadButton.X);
    command.tacklePressed = tackleHeld && !this.tackleWasHeld;
    this.tackleWasHeld = tackleHeld;

    const lobHeld = pressed(GamepadButton.Y);
    command.lobToggle = lobHeld && !this.lobWasHeld;
    this.lobWasHeld = lobHeld;

    const startHeld = pressed(GamepadButton.Start);
    if (startHeld && !this.startWasHeld) this.onPause?.();
    this.startWasHeld = startHeld;

    return command;
  }
}
