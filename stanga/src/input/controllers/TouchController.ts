/**
 * Drives a player from one on-screen touch pad.
 *
 * Two pads can live side by side (player 1 on the left half, player 2 on the
 * right), and each pad owns its pointers: a pointer is captured by the control
 * it started on and stays with it until pointerup or pointercancel, so one
 * player's thumb can never steal the other's stick.
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

/**
 * Which part of the screen the pad occupies.
 * 'full' is the single-player layout (stick left, buttons right); 'left' and
 * 'right' are the two halves used when two people share one device.
 */
export type TouchSide = 'left' | 'right' | 'full';

interface StickPointer {
  pointerId: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
}

/** How far a finger travels on the kick button for a full aim or curl. */
const AIM_SWIPE_PIXELS = 90;
const SPIN_SWIPE_PIXELS = 110;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

export class HumanTouchController implements PlayerController {
  readonly kind = 'touch' as const;
  readonly root: HTMLDivElement;

  private readonly lookZone: HTMLDivElement;
  private readonly stickZone: HTMLDivElement;
  private readonly stickBase: HTMLDivElement;
  private readonly stickKnob: HTMLDivElement;
  private readonly shootButton: HTMLButtonElement;
  private readonly sprintButton: HTMLButtonElement;
  private readonly tackleButton: HTMLButtonElement;
  private readonly lobButton: HTMLButtonElement;
  private readonly passButton: HTMLButtonElement;
  private readonly juggleButton: HTMLButtonElement;
  /** Where the kick finger went down, so a drag on it can steer the strike. */
  private shootOrigin: { x: number; y: number } | null = null;
  private verticalAim = 0;
  private spin = 0;
  private passPointer: number | null = null;
  private passWasHeld = false;
  private jugglePending = false;
  private readonly nameTag: HTMLSpanElement;

  private readonly command: PlayerCommand;
  private readonly sequence = new SequenceCounter();
  private readonly cleanups: (() => void)[] = [];

  private stick: StickPointer | null = null;
  /** The finger currently swinging the camera, and where it was last frame. */
  private lookPointer: number | null = null;
  private lookLast = { x: 0, y: 0 };
  /** Screen fractions dragged since the game last read them. */
  private lookDelta = { x: 0, y: 0 };
  /** Pointer currently owning each hold button, or null. */
  private shootPointer: number | null = null;
  private sprintPointer: number | null = null;
  private tacklePending = false;
  private lobPending = false;
  private shootWasHeld = false;
  private sensitivity = 1;

  constructor(
    readonly deviceId: string,
    readonly label: string,
    private readonly side: TouchSide,
  ) {
    this.command = createPlayerCommand('');

    this.root = document.createElement('div');
    this.root.className = `touch-pad touch-pad--${side}`;
    // Physical layout, never mirrored by the RTL document direction.
    this.root.dir = 'ltr';

    this.nameTag = document.createElement('span');
    this.nameTag.className = 'touch-pad__name';
    this.nameTag.textContent = label;
    // The solo layout needs no name tag above the controls.
    if (side === 'full') this.nameTag.classList.add('is-hidden');

    /*
     * The look zone is the whole pad, and it is added first so that every
     * actual control sits on top of it. A finger that lands on the stick or a
     * button belongs to that control; a finger that lands anywhere else — the
     * middle of the screen, the empty space above the buttons — swings the
     * camera. That is the rule people already expect from a phone game, and it
     * needs no visible furniture of its own.
     */
    this.lookZone = document.createElement('div');
    this.lookZone.className = 'touch-pad__look-zone';

    this.stickZone = document.createElement('div');
    this.stickZone.className = 'touch-pad__stick-zone';
    this.stickBase = document.createElement('div');
    this.stickBase.className = 'touch-stick-base';
    this.stickKnob = document.createElement('div');
    this.stickKnob.className = 'touch-stick-knob';
    this.stickBase.appendChild(this.stickKnob);
    this.stickZone.appendChild(this.stickBase);

    const actions = document.createElement('div');
    actions.className = 'touch-pad__actions';
    this.shootButton = makeButton('touch-button touch-button--kick', 'בעיטה');
    this.sprintButton = makeButton('touch-button touch-button--sprint', 'ספרינט');
    this.tackleButton = makeButton('touch-button touch-button--tackle', 'חטיפה');
    this.lobButton = makeButton('touch-button touch-button--loft', 'שטוחה');
    this.passButton = makeButton('touch-button touch-button--pass', 'מסירה');
    this.juggleButton = makeButton('touch-button touch-button--juggle', 'הקפצה');
    actions.append(
      this.lobButton,
      this.juggleButton,
      this.tackleButton,
      this.passButton,
      this.sprintButton,
      this.shootButton,
    );

    this.root.append(this.lookZone, this.nameTag, this.stickZone, actions);

    this.bindLook();
    this.bindStick();
    this.bindHold(this.shootButton, 'shoot');
    this.bindHold(this.sprintButton, 'sprint');
    this.bindTap(this.tackleButton, () => {
      this.tacklePending = true;
    });
    this.bindTap(this.lobButton, () => {
      this.lobPending = true;
    });
    this.bindHold(this.passButton, 'pass');
    this.bindTap(this.juggleButton, () => {
      this.jugglePending = true;
    });
    this.bindKickAiming();
  }

  /** Drag anywhere that is not a control to swing the view. */
  private bindLook(): void {
    const onDown = (event: PointerEvent) => {
      if (this.lookPointer !== null) return;
      event.preventDefault();
      this.lookZone.setPointerCapture(event.pointerId);
      this.lookPointer = event.pointerId;
      this.lookLast = { x: event.clientX, y: event.clientY };
    };
    const onMove = (event: PointerEvent) => {
      if (this.lookPointer !== event.pointerId) return;
      event.preventDefault();
      // As a fraction of the screen, so a phone and a tablet feel the same.
      const width = window.innerWidth || 1;
      const height = window.innerHeight || 1;
      this.lookDelta.x += (event.clientX - this.lookLast.x) / width;
      this.lookDelta.y += (event.clientY - this.lookLast.y) / height;
      this.lookLast = { x: event.clientX, y: event.clientY };
    };
    const onUp = (event: PointerEvent) => {
      if (this.lookPointer !== event.pointerId) return;
      this.lookPointer = null;
    };

    this.lookZone.addEventListener('pointerdown', onDown, { passive: false });
    this.lookZone.addEventListener('pointermove', onMove, { passive: false });
    this.lookZone.addEventListener('pointerup', onUp);
    this.lookZone.addEventListener('pointercancel', onUp);
    this.cleanups.push(() => {
      this.lookZone.removeEventListener('pointerdown', onDown);
      this.lookZone.removeEventListener('pointermove', onMove);
      this.lookZone.removeEventListener('pointerup', onUp);
      this.lookZone.removeEventListener('pointercancel', onUp);
    });
  }

  /**
   * How far the view has been dragged since this was last called, in screen
   * fractions, and clears it. The camera is the renderer's business, so the
   * controller only reports; it never reaches for a camera itself.
   */
  consumeLook(): { x: number; y: number } {
    const delta = { x: this.lookDelta.x, y: this.lookDelta.y };
    this.lookDelta.x = 0;
    this.lookDelta.y = 0;
    return delta;
  }

  /**
   * Turns the look zone off. The shared camera of a two-player match frames
   * both players at once, so there is nothing sensible for a swing to do —
   * and a control that silently does nothing is worse than no control.
   */
  setLookEnabled(enabled: boolean): void {
    this.lookZone.classList.toggle('is-hidden', !enabled);
    if (!enabled) {
      this.lookPointer = null;
      this.lookDelta.x = 0;
      this.lookDelta.y = 0;
    }
  }

  /**
   * Dragging on the kick button while it is held aims the strike: up for a
   * lofted ball, sideways for curl. It is the phone's stand-in for a right
   * stick, and it only listens while the shot is actually charging.
   */
  private bindKickAiming(): void {
    const onMove = (event: PointerEvent) => {
      if (this.shootPointer !== event.pointerId || !this.shootOrigin) return;
      event.preventDefault();
      const dx = event.clientX - this.shootOrigin.x;
      const dy = this.shootOrigin.y - event.clientY;
      this.verticalAim = clampUnit(dy / AIM_SWIPE_PIXELS);
      this.spin = clampUnit(dx / SPIN_SWIPE_PIXELS);
    };
    this.shootButton.addEventListener('pointermove', onMove, { passive: false });
    this.cleanups.push(() => this.shootButton.removeEventListener('pointermove', onMove));
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
  }

  setLabel(label: string): void {
    this.nameTag.textContent = label;
  }

  setAccentColor(color: string): void {
    this.root.style.setProperty('--pad-accent', color);
  }

  setSensitivity(value: number): void {
    this.sensitivity = value;
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('is-hidden', !visible);
    if (!visible) this.reset();
  }

  /** Reflects the player's current shot type on the toggle. */
  setLofted(lofted: boolean): void {
    this.lobButton.textContent = lofted ? 'מוגבהת' : 'שטוחה';
    this.lobButton.classList.toggle('is-active', lofted);
  }

  setChargeRatio(ratio: number): void {
    this.shootButton.style.setProperty('--charge', String(Math.max(0, Math.min(1, ratio))));
  }

  isConnected(): boolean {
    return true;
  }

  reset(): void {
    if (this.shootPointer !== null) {
      // Do not leave a charged shot stuck if the pad is hidden mid-charge.
      this.shootPointer = null;
    }
    this.sprintPointer = null;
    this.passPointer = null;
    this.lookPointer = null;
    this.lookDelta.x = 0;
    this.lookDelta.y = 0;
    this.stick = null;
    this.tacklePending = false;
    this.lobPending = false;
    this.jugglePending = false;
    this.passWasHeld = false;
    this.shootOrigin = null;
    this.verticalAim = 0;
    this.spin = 0;
    this.shootWasHeld = false;
    this.sequence.reset();
    this.stickBase.classList.remove('is-active');
    this.shootButton.classList.remove('is-pressed');
    this.sprintButton.classList.remove('is-pressed');
    this.stickKnob.style.transform = 'translate(-50%, -50%)';
  }

  poll(playerId: string, tickId: number, context: ControlContext): PlayerCommand {
    const command = this.command;
    command.playerId = playerId;
    resetPlayerCommand(command, tickId, this.sequence.next());

    const raw = this.stick
      ? { x: this.stick.x * this.sensitivity, y: this.stick.y * this.sensitivity }
      : { x: 0, y: 0 };
    const move = applyDeadZone(raw.x, raw.y, GameConfig.input.deadZone);
    const world = rotateByYaw(move.x, move.y, context.cameraYaw);
    command.moveX = world.x;
    command.moveY = world.z;
    if (move.magnitude > 0) {
      command.aimX = world.x;
      command.aimY = world.z;
    }

    command.sprintPressed = this.sprintPointer !== null;

    const shootHeld = this.shootPointer !== null;
    command.shootHeld = shootHeld;
    command.shootPressed = shootHeld && !this.shootWasHeld;
    command.shootReleased = !shootHeld && this.shootWasHeld;
    this.shootWasHeld = shootHeld;

    const passHeld = this.passPointer !== null;
    command.passHeld = passHeld;
    command.passPressed = passHeld && !this.passWasHeld;
    command.passReleased = !passHeld && this.passWasHeld;
    this.passWasHeld = passHeld;

    command.tacklePressed = this.tacklePending;
    this.tacklePending = false;
    command.jugglePressed = this.jugglePending;
    this.jugglePending = false;
    // The flat/high button snaps the aim this controller keeps, rather than
    // asking the simulation to flip a flag that the next tick would overwrite.
    command.lobToggle = this.lobPending;
    if (this.lobPending) {
      this.verticalAim =
        this.verticalAim > GameConfig.kick.highAim * 0.3
          ? GameConfig.kick.flatAim
          : GameConfig.kick.highAim;
    }
    this.lobPending = false;

    command.verticalAim = this.verticalAim;
    command.spin = this.spin;

    return command;
  }

  dispose(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
    this.root.remove();
  }

  // ── Pointer plumbing ────────────────────────────────────────────────────────

  private bindStick(): void {
    const zone = this.stickZone;
    const radius = GameConfig.input.joystickRadiusPx;

    const onDown = (event: PointerEvent) => {
      // One stick, one pointer: a second finger in the zone is ignored.
      if (this.stick) return;
      event.preventDefault();
      try {
        zone.setPointerCapture(event.pointerId);
      } catch {
        // Capture is best-effort; the pointerId check below is the real guard.
      }
      this.stick = {
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        x: 0,
        y: 0,
      };
      this.stickBase.style.left = `${event.clientX}px`;
      this.stickBase.style.top = `${event.clientY}px`;
      this.stickBase.classList.add('is-active');
      this.stickKnob.style.transform = 'translate(-50%, -50%)';
    };

    const onMove = (event: PointerEvent) => {
      const stick = this.stick;
      if (!stick || stick.pointerId !== event.pointerId) return;
      event.preventDefault();
      const dx = event.clientX - stick.originX;
      const dy = event.clientY - stick.originY;
      const distance = Math.hypot(dx, dy);
      const limited = Math.min(distance, radius);
      const nx = distance > 0 ? (dx / distance) * limited : 0;
      const ny = distance > 0 ? (dy / distance) * limited : 0;
      stick.x = nx / radius;
      // Screen Y grows downwards; forward is negative Y.
      stick.y = -ny / radius;
      this.stickKnob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
    };

    const onUp = (event: PointerEvent) => {
      if (this.stick?.pointerId !== event.pointerId) return;
      this.stick = null;
      this.stickBase.classList.remove('is-active');
      this.stickKnob.style.transform = 'translate(-50%, -50%)';
    };

    zone.addEventListener('pointerdown', onDown);
    zone.addEventListener('pointermove', onMove);
    zone.addEventListener('pointerup', onUp);
    zone.addEventListener('pointercancel', onUp);
    zone.addEventListener('lostpointercapture', onUp);
    this.cleanups.push(() => {
      zone.removeEventListener('pointerdown', onDown);
      zone.removeEventListener('pointermove', onMove);
      zone.removeEventListener('pointerup', onUp);
      zone.removeEventListener('pointercancel', onUp);
      zone.removeEventListener('lostpointercapture', onUp);
    });
  }

  private bindHold(button: HTMLElement, kind: 'shoot' | 'sprint' | 'pass'): void {
    const get = () =>
      kind === 'shoot'
        ? this.shootPointer
        : kind === 'pass'
          ? this.passPointer
          : this.sprintPointer;
    const set = (pointerId: number | null) => {
      if (kind === 'shoot') this.shootPointer = pointerId;
      else if (kind === 'pass') this.passPointer = pointerId;
      else this.sprintPointer = pointerId;
    };
    const onDown = (event: PointerEvent) => {
      if (get() !== null) return;
      event.preventDefault();
      try {
        button.setPointerCapture(event.pointerId);
      } catch {
        // Best-effort; ownership is tracked by pointerId regardless.
      }
      button.classList.add('is-pressed');
      set(event.pointerId);
      if (kind === 'shoot') {
        // A fresh charge starts from a neutral aim, so the last swipe does
        // not silently decide the next shot.
        this.shootOrigin = { x: event.clientX, y: event.clientY };
        this.verticalAim = 0;
        this.spin = 0;
      }
    };
    const onUp = (event: PointerEvent) => {
      if (get() !== event.pointerId) return;
      set(null);
      if (kind === 'shoot') this.shootOrigin = null;
      button.classList.remove('is-pressed');
    };
    button.addEventListener('pointerdown', onDown);
    button.addEventListener('pointerup', onUp);
    button.addEventListener('pointercancel', onUp);
    button.addEventListener('lostpointercapture', onUp);
    this.cleanups.push(() => {
      button.removeEventListener('pointerdown', onDown);
      button.removeEventListener('pointerup', onUp);
      button.removeEventListener('pointercancel', onUp);
      button.removeEventListener('lostpointercapture', onUp);
    });
  }

  private bindTap(button: HTMLElement, action: () => void): void {
    const onDown = (event: PointerEvent) => {
      event.preventDefault();
      button.classList.add('is-pressed');
      action();
    };
    const onUp = () => button.classList.remove('is-pressed');
    button.addEventListener('pointerdown', onDown);
    button.addEventListener('pointerup', onUp);
    button.addEventListener('pointercancel', onUp);
    this.cleanups.push(() => {
      button.removeEventListener('pointerdown', onDown);
      button.removeEventListener('pointerup', onUp);
      button.removeEventListener('pointercancel', onUp);
    });
  }

  /** Test seam: reports which pointer currently owns each control. */
  get ownership(): { stick: number | null; shoot: number | null; sprint: number | null } {
    return {
      stick: this.stick?.pointerId ?? null,
      shoot: this.shootPointer,
      sprint: this.sprintPointer,
    };
  }

  get sideOfScreen(): TouchSide {
    return this.side;
  }
}

function makeButton(className: string, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.setAttribute('aria-label', label);
  return button;
}
