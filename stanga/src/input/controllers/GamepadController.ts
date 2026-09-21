/**
 * Drives a player from a standard-layout gamepad.
 *
 * Mapping (standard gamepad):
 *   Left stick  — movement          Right stick — aim
 *   A / Cross   — shoot (hold+release)
 *   X / Square  — tackle            Y / Triangle — flat / lofted
 *   Right trigger — sprint          Start — pause
 */
import { GameConfig, type ShotStyle } from '../../config/GameConfig';
import type { ControlContext, PlayerController } from '../PlayerController';
import { SequenceCounter } from '../PlayerController';
import {
  applyDeadZone,
  nextShotStyle,
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

/** Keeps a raw axis inside -1..1, where a worn stick can overshoot. */
function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

export class HumanGamepadController implements PlayerController {
  readonly kind = 'gamepad' as const;
  private readonly command: PlayerCommand;
  private readonly sequence = new SequenceCounter();
  private shootWasHeld = false;
  private highWasHeld = false;
  private lowWasHeld = false;
  private styleWasHeld = false;
  /** Which of the five shapes the next strike takes. */
  private shotStyle: ShotStyle = 'normal';
  /** Direction a charging strike is being swung along, world radians. */
  private shotYaw = 0;
  private steering = false;
  /** Aim height, kept between ticks so the flat/high button sticks. */
  private verticalAim = 0;
  private tackleWasHeld = false;
  private passWasHeld = false;
  private juggleWasHeld = false;
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
    this.highWasHeld = false;
    this.lowWasHeld = false;
    this.styleWasHeld = false;
    this.steering = false;
    this.shotStyle = 'normal';
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
    /*
     * The d-pad walks the player around — until a shot is charging, when it
     * becomes the aim pad instead: up puts the ball in the air, down flattens
     * it, left and right swing the direction. One control, two jobs that are
     * never wanted at the same moment; the left stick keeps moving throughout.
     */
    const aiming = pressed(GamepadButton.A) || value(GamepadButton.A) > 0.5;
    if (!aiming) {
      if (pressed(GamepadButton.DpadUp)) rawY = 1;
      if (pressed(GamepadButton.DpadDown)) rawY = -1;
      if (pressed(GamepadButton.DpadLeft)) rawX = -1;
      if (pressed(GamepadButton.DpadRight)) rawX = 1;
    }

    const move = applyDeadZone(rawX, rawY, this.deadZone);
    const worldMove = rotateByYaw(move.x, move.y, context.cameraYaw);
    command.moveX = worldMove.x;
    command.moveY = worldMove.z;

    const aim = applyDeadZone(axis(2), -axis(3), this.deadZone);
    // The right stick does double duty: where it points is where the player
    // faces, and how far up or sideways it is pushed is how high and how bent
    // the next strike will be. That is what makes the crossbar reachable on a
    // pad without a second stick.
    /*
     * The right stick does double duty: where it points is where the player
     * faces, and how far up or sideways it is pushed is how high and how bent
     * the next strike will be. That is what makes the crossbar reachable on a
     * pad without a second stick.
     *
     * Pushing the stick overrides the aim; letting go leaves it where the
     * flat/high button last parked it, so the high ball is a setting and not
     * something you have to hold.
     */
    const stickAim = clampUnit(-axis(3));
    if (Math.abs(stickAim) > this.deadZone) this.verticalAim = stickAim;
    command.verticalAim = this.verticalAim;
    command.spin = clampUnit(axis(2)) * 0.85;
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

    const shootHeld = aiming;
    command.shootHeld = shootHeld;
    command.shootPressed = shootHeld && !this.shootWasHeld;
    command.shootReleased = !shootHeld && this.shootWasHeld;
    this.shootWasHeld = shootHeld;

    const tackleHeld = pressed(GamepadButton.X);
    command.tacklePressed = tackleHeld && !this.tackleWasHeld;
    this.tackleWasHeld = tackleHeld;

    // B/Circle passes, Y/Triangle flicks the ball up, the left trigger turns
    // the next strike into a chip. A/Cross stays the shot, as it always was.
    const passHeld = pressed(GamepadButton.B);
    command.passHeld = passHeld;
    command.passPressed = passHeld && !this.passWasHeld;
    command.passReleased = !passHeld && this.passWasHeld;
    this.passWasHeld = passHeld;

    const juggleHeld = pressed(GamepadButton.Y);
    command.jugglePressed = juggleHeld && !this.juggleWasHeld;
    this.juggleWasHeld = juggleHeld;

    command.chipRequested =
      value(GamepadButton.LeftTrigger) > 0.35 || pressed(GamepadButton.LeftBumper);

    // Height: a press of up or down is decisive, and holding it walks the
    // angle the rest of the way, exactly as the keyboard's aim keys do.
    const highHeld = pressed(GamepadButton.DpadUp);
    const lowHeld = pressed(GamepadButton.DpadDown);
    if (highHeld && !this.highWasHeld) this.verticalAim = GameConfig.kick.highAim;
    if (lowHeld && !this.lowWasHeld) this.verticalAim = GameConfig.kick.flatAim;
    if (shootHeld && highHeld) this.verticalAim += AIM_RATE * context.dt;
    if (shootHeld && lowHeld) this.verticalAim -= AIM_RATE * context.dt;
    this.verticalAim = clampUnit(this.verticalAim);
    this.highWasHeld = highHeld;
    this.lowWasHeld = lowHeld;
    command.verticalAim = this.verticalAim;

    // Clicking the left stick cycles the shape of the next strike.
    const styleHeld = pressed(GamepadButton.LeftStick);
    const cycled = styleHeld && !this.styleWasHeld;
    if (cycled) this.shotStyle = nextShotStyle(this.shotStyle);
    this.styleWasHeld = styleHeld;
    command.styleCycle = cycled;
    command.shotStyle = this.shotStyle;

    // Direction, while charging: the d-pad swings the strike off the body's
    // own facing, so a long charge can be walked across the goal.
    if (shootHeld) {
      if (!this.steering) {
        this.shotYaw = context.player?.facing ?? 0;
        this.steering = true;
      }
      let steer = 0;
      if (pressed(GamepadButton.DpadRight)) steer += 1;
      if (pressed(GamepadButton.DpadLeft)) steer -= 1;
      this.shotYaw += steer * SHOT_STEER_RATE * context.dt;
      if (steer !== 0 || move.magnitude === 0) {
        command.aimX = Math.sin(this.shotYaw);
        command.aimY = Math.cos(this.shotYaw);
      } else {
        this.shotYaw = Math.atan2(worldMove.x, worldMove.z);
      }
    } else {
      this.steering = false;
    }

    const startHeld = pressed(GamepadButton.Start);
    if (startHeld && !this.startWasHeld) this.onPause?.();
    this.startWasHeld = startHeld;

    return command;
  }
}

/** How fast the aim pad sweeps the height range, in units per second. */
const AIM_RATE = 1.6;

/** How fast the aim pad swings a charging strike, in radians per second. */
const SHOT_STEER_RATE = 1.9;
