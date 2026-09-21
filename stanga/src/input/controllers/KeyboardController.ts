/**
 * Drives a player from a keyboard profile.
 *
 * Reads the shared KeyboardState rather than attaching its own listeners, so two
 * profiles on one physical keyboard stay in lockstep and edges are never lost.
 */
import { GameConfig, type ShotStyle } from '../../config/GameConfig';
import type { KeyMap } from '../KeyBindings';
import type { KeyboardState } from '../KeyboardState';
import type { ControlContext, PlayerController } from '../PlayerController';
import { SequenceCounter } from '../PlayerController';
import {
  applyDeadZone,
  createPlayerCommand,
  nextShotStyle,
  resetPlayerCommand,
  rotateByYaw,
  type PlayerCommand,
} from '../PlayerCommand';

export class HumanKeyboardController implements PlayerController {
  readonly kind = 'keyboard' as const;
  private readonly command: PlayerCommand;
  private readonly sequence = new SequenceCounter();
  private shootWasHeld = false;
  private passWasHeld = false;
  /** Where the next strike is aimed, kept between ticks like a trim wheel. */
  private verticalAim = 0;
  /** Which of the five shapes the next strike takes. */
  private shotStyle: ShotStyle = 'normal';
  /**
   * Direction the strike is being steered along while the shoot key is held,
   * in world radians. Seeded from the player's own facing when the charge
   * starts, so the arrows nudge the shot rather than snapping it somewhere.
   */
  private shotYaw = 0;
  private steering = false;
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
    this.passWasHeld = false;
    this.verticalAim = 0;
    this.shotStyle = 'normal';
    this.steering = false;
    this.sequence.reset();
  }

  /** Where this player is aiming, so the HUD can show it before the kick. */
  get aimHeight(): number {
    return this.verticalAim;
  }

  /** The shape the next strike takes, for the HUD. */
  get style(): ShotStyle {
    return this.shotStyle;
  }

  poll(playerId: string, tickId: number, context: ControlContext): PlayerCommand {
    const command = this.command;
    command.playerId = playerId;
    resetPlayerCommand(command, tickId, this.sequence.next());

    const heldAny = (codes: string[]) => codes.some((code) => this.keyboard.isHeld(code));
    const pressedAny = (codes: string[]) => codes.some((code) => this.keyboard.wasPressed(code));

    const shootHeld = heldAny(this.keys.shoot);
    /*
     * While a shot is charging the aim keys are aim keys and nothing else.
     *
     * In the solo profile the arrows are bound to both movement and aiming, so
     * a key that is steering the strike must not also be walking the player
     * into it. WASD is unaffected and keeps moving, which is what lets someone
     * run onto a ball while swinging the shot across the goal.
     */
    const aimCodes = shootHeld
      ? new Set([
          ...this.keys.aimUp,
          ...this.keys.aimDown,
          ...this.keys.aimLeft,
          ...this.keys.aimRight,
        ])
      : EMPTY_CODES;
    const moveHeld = (codes: string[]) =>
      codes.some((code) => !aimCodes.has(code) && this.keyboard.isHeld(code));

    let x = 0;
    let y = 0;
    if (moveHeld(this.keys.up)) y += 1;
    if (moveHeld(this.keys.down)) y -= 1;
    if (moveHeld(this.keys.right)) x += 1;
    if (moveHeld(this.keys.left)) x -= 1;

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

    command.shootHeld = shootHeld;
    command.shootPressed = shootHeld && !this.shootWasHeld;
    command.shootReleased = !shootHeld && this.shootWasHeld;
    this.shootWasHeld = shootHeld;

    const passHeld = heldAny(this.keys.pass);
    command.passHeld = passHeld;
    command.passPressed = passHeld && !this.passWasHeld;
    command.passReleased = !passHeld && this.passWasHeld;
    this.passWasHeld = passHeld;

    command.jugglePressed = pressedAny(this.keys.juggle);
    command.tacklePressed = pressedAny(this.keys.tackle);
    command.chipRequested = heldAny(this.keys.chip);

    /*
     * Height. A press is decisive and a hold is fine: tapping up puts the ball
     * in the air immediately, and keeping the key down walks the angle the
     * rest of the way. A trim that only ever crept would mean nobody ever
     * found the high ball, which is exactly how this used to read.
     */
    const dt = context.dt;
    if (pressedAny(this.keys.aimUp)) this.verticalAim = GameConfig.kick.highAim;
    if (pressedAny(this.keys.aimDown)) this.verticalAim = GameConfig.kick.flatAim;
    if (heldAny(this.keys.aimUp)) this.verticalAim += AIM_RATE * dt;
    if (heldAny(this.keys.aimDown)) this.verticalAim -= AIM_RATE * dt;
    this.verticalAim = Math.max(-1, Math.min(1, this.verticalAim));
    command.verticalAim = this.verticalAim;

    // The style control cycles the five shapes. It lives here rather than in
    // the simulation: the style is sent every tick, so anything the simulation
    // flipped was overwritten a tick later.
    const cycled = pressedAny(this.keys.style);
    if (cycled) this.shotStyle = nextShotStyle(this.shotStyle);
    command.styleCycle = cycled;
    command.shotStyle = this.shotStyle;

    /*
     * Direction. While the shoot key is held, left and right swing where the
     * ball is struck; the swing starts from the player's own facing so it
     * nudges rather than jumps, and it survives from tick to tick so a long
     * charge can be walked right across the goal.
     */
    if (shootHeld && !this.steering) {
      this.shotYaw = context.player?.facing ?? yawOfWorld(world.x, world.z);
      this.steering = true;
    } else if (!shootHeld) {
      this.steering = false;
    }
    if (this.steering) {
      let steer = 0;
      if (heldAny(this.keys.aimRight)) steer += 1;
      if (heldAny(this.keys.aimLeft)) steer -= 1;
      this.shotYaw += steer * SHOT_STEER_RATE * dt;
      if (steer !== 0 || stick.magnitude === 0) {
        command.aimX = Math.sin(this.shotYaw);
        command.aimY = Math.cos(this.shotYaw);
      } else {
        // Still steering by running: keep the swing in step with the body so
        // releasing the arrows does not snap the shot back.
        this.shotYaw = yawOfWorld(world.x, world.z);
      }
    }

    let spin = 0;
    if (heldAny(this.keys.curlRight)) spin += 1;
    if (heldAny(this.keys.curlLeft)) spin -= 1;
    command.spin = spin;

    return command;
  }

  /** Codes this profile owns, so the page never scrolls while playing. */
  ownedCodes(): string[] {
    return Object.values(this.keys).flat();
  }
}

export const KEYBOARD_DEAD_ZONE = GameConfig.input.deadZone;

/** How fast the aim keys sweep the full range, in units per second. */
const AIM_RATE = 1.6;

/** How fast the direction keys swing a charging strike, in radians per second. */
const SHOT_STEER_RATE = 1.9;

/** Shared empty set, so the no-charge path allocates nothing. */
const EMPTY_CODES: ReadonlySet<string> = new Set();

/** Yaw of a world-space ground vector, 0 = +Z. */
function yawOfWorld(x: number, z: number): number {
  return Math.atan2(x, z);
}
