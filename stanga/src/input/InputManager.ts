/**
 * InputManager — the single funnel for every human input.
 *
 * Keyboard and touch both land here and leave as one `InputCommand`. The AI
 * produces the same structure, and a future network client will too, so the
 * simulation only ever sees commands and never a device.
 */
import { GameConfig } from '../config/GameConfig';
import { applyStick, createCommand, resetCommand, rotateByYaw, type InputCommand } from './Command';
import { KeyboardInput } from './KeyboardInput';
import { TouchInput } from './TouchInput';

export interface InputManagerOptions {
  playerId: string;
  onPause: () => void;
  /** Where the touch layer is mounted. */
  touchParent: HTMLElement;
}

export class InputManager {
  private readonly command: InputCommand;
  private readonly keyboard: KeyboardInput;
  private readonly touch: TouchInput;
  private detachKeyboard: (() => void) | null = null;
  private lofted = false;
  private sensitivity: number = GameConfig.input.sensitivityDefault;
  private touchEnabled = false;

  constructor(private readonly options: InputManagerOptions) {
    this.command = createCommand(options.playerId);
    this.keyboard = new KeyboardInput((action) => {
      if (action === 'pause') this.options.onPause();
      if (action === 'toggleLoft') this.toggleLoft();
    });
    this.touch = new TouchInput((action) => {
      if (action === 'pause') this.options.onPause();
      if (action === 'toggleLoft') this.toggleLoft();
    });
    this.touch.mount(options.touchParent);
    this.touch.setLofted(this.lofted);
    this.touch.setVisible(false);
  }

  attach(): void {
    this.detachKeyboard ??= this.keyboard.attach();
  }

  detach(): void {
    this.detachKeyboard?.();
    this.detachKeyboard = null;
    this.clear();
  }

  /** Shows or hides the on-screen controls. */
  setTouchEnabled(enabled: boolean): void {
    this.touchEnabled = enabled;
    this.touch.setVisible(enabled);
  }

  setSensitivity(value: number): void {
    this.sensitivity = value;
  }

  setChargeRatio(ratio: number): void {
    this.touch.setChargeRatio(ratio);
  }

  get isLofted(): boolean {
    return this.lofted;
  }

  toggleLoft(): void {
    this.lofted = !this.lofted;
    this.touch.setLofted(this.lofted);
  }

  clear(): void {
    this.keyboard.clear();
    this.touch.clear();
    // Drop any edge events so a paused frame cannot fire a shot later.
    this.keyboard.consumeKickRelease();
    this.keyboard.consumeTackle();
    this.touch.consumeKickRelease();
    this.touch.consumeTackle();
  }

  /**
   * Builds the command for one simulation tick.
   * `cameraYaw` makes movement camera-relative; `aimYaw` is the shot direction.
   */
  buildCommand(tick: number, cameraYaw: number, aimYaw: number): InputCommand {
    resetCommand(this.command, tick);

    const keys = this.keyboard.readAxes();
    const stick = this.touch.readAxes();
    const rawX = (keys.x + stick.x) * this.sensitivity;
    const rawZ = (keys.z + stick.z) * this.sensitivity;

    applyStick(this.command, clampAxis(rawX), clampAxis(rawZ), GameConfig.input.deadZone);

    // Turn the camera-relative stick into world space.
    const world = rotateByYaw(this.command.moveX, this.command.moveZ, cameraYaw);
    this.command.moveX = world.x;
    this.command.moveZ = world.z;

    this.command.sprint = this.keyboard.sprinting || this.touch.sprinting;
    this.command.chargeKick = this.keyboard.charging || this.touch.charging;
    this.command.releaseKick =
      this.keyboard.consumeKickRelease() || this.touch.consumeKickRelease();
    this.command.tackle = this.keyboard.consumeTackle() || this.touch.consumeTackle();
    this.command.lofted = this.lofted;
    // Steering while charging is how a human aims; with no stick input the
    // current facing is kept, which is what the caller passes in.
    const steering = this.command.moveX !== 0 || this.command.moveZ !== 0;
    this.command.aimYaw = steering ? Math.atan2(this.command.moveX, this.command.moveZ) : aimYaw;

    return this.command;
  }

  get hasTouchLayer(): boolean {
    return this.touchEnabled;
  }

  dispose(): void {
    this.detach();
    this.touch.dispose();
  }
}

function clampAxis(value: number): number {
  return value < -1 ? -1 : value > 1 ? 1 : value;
}
