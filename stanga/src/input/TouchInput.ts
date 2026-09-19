/**
 * Touch controls: a virtual joystick on the left and action buttons on the right.
 * Owns its own DOM layer; it reports intent only, exactly like the keyboard source.
 */
import { GameConfig } from '../config/GameConfig';

export type TouchAction = 'toggleLoft' | 'pause';

interface JoystickState {
  pointerId: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
}

export class TouchInput {
  readonly root: HTMLDivElement;
  private readonly stickBase: HTMLDivElement;
  private readonly stickKnob: HTMLDivElement;
  private readonly kickButton: HTMLButtonElement;
  private readonly sprintButton: HTMLButtonElement;
  private readonly tackleButton: HTMLButtonElement;
  private readonly loftButton: HTMLButtonElement;

  private joystick: JoystickState | null = null;
  private sprintPointer: number | null = null;
  private kickPointer: number | null = null;
  private tacklePending = false;
  private kickReleasePending = false;
  private readonly cleanups: (() => void)[] = [];

  constructor(private readonly onAction: (action: TouchAction) => void) {
    this.root = document.createElement('div');
    this.root.className = 'touch-layer';
    // Physical layout: the stick is always on the left, the buttons on the right.
    // The RTL document direction must not mirror the controls.
    this.root.dir = 'ltr';

    const stickZone = document.createElement('div');
    stickZone.className = 'touch-stick-zone';

    this.stickBase = document.createElement('div');
    this.stickBase.className = 'touch-stick-base';
    this.stickKnob = document.createElement('div');
    this.stickKnob.className = 'touch-stick-knob';
    this.stickBase.appendChild(this.stickKnob);
    stickZone.appendChild(this.stickBase);

    const actions = document.createElement('div');
    actions.className = 'touch-actions';

    this.kickButton = createButton('touch-button touch-button--kick', 'בעיטה', 'בעיטה');
    this.sprintButton = createButton('touch-button touch-button--sprint', 'ספרינט', 'ספרינט');
    this.tackleButton = createButton('touch-button touch-button--tackle', 'חטיפה', 'חטיפה');
    this.loftButton = createButton('touch-button touch-button--loft', 'שטוחה', 'סוג בעיטה');

    actions.append(this.loftButton, this.tackleButton, this.sprintButton, this.kickButton);
    this.root.append(stickZone, actions);

    this.bindJoystick(stickZone);
    this.bindHold(this.kickButton, 'kick');
    this.bindHold(this.sprintButton, 'sprint');
    this.bindTap(this.tackleButton, () => {
      this.tacklePending = true;
    });
    this.bindTap(this.loftButton, () => this.onAction('toggleLoft'));
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('is-hidden', !visible);
    if (!visible) this.clear();
  }

  /** Reflects the current shot type on the toggle button. */
  setLofted(lofted: boolean): void {
    this.loftButton.textContent = lofted ? 'מוגבהת' : 'שטוחה';
    this.loftButton.classList.toggle('is-active', lofted);
  }

  setChargeRatio(ratio: number): void {
    this.kickButton.style.setProperty('--charge', String(Math.max(0, Math.min(1, ratio))));
  }

  private bindJoystick(zone: HTMLElement): void {
    const radius = GameConfig.input.joystickRadiusPx;

    const onDown = (event: PointerEvent) => {
      if (this.joystick) return;
      event.preventDefault();
      zone.setPointerCapture(event.pointerId);
      this.joystick = {
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
      const stick = this.joystick;
      if (!stick || stick.pointerId !== event.pointerId) return;
      event.preventDefault();
      const dx = event.clientX - stick.originX;
      const dy = event.clientY - stick.originY;
      const distance = Math.hypot(dx, dy);
      const limited = Math.min(distance, radius);
      const nx = distance > 0 ? (dx / distance) * limited : 0;
      const ny = distance > 0 ? (dy / distance) * limited : 0;
      stick.x = nx / radius;
      stick.y = ny / radius;
      this.stickKnob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
    };

    const onUp = (event: PointerEvent) => {
      const stick = this.joystick;
      if (!stick || stick.pointerId !== event.pointerId) return;
      this.joystick = null;
      this.stickBase.classList.remove('is-active');
      this.stickKnob.style.transform = 'translate(-50%, -50%)';
    };

    zone.addEventListener('pointerdown', onDown);
    zone.addEventListener('pointermove', onMove);
    zone.addEventListener('pointerup', onUp);
    zone.addEventListener('pointercancel', onUp);
    this.cleanups.push(() => {
      zone.removeEventListener('pointerdown', onDown);
      zone.removeEventListener('pointermove', onMove);
      zone.removeEventListener('pointerup', onUp);
      zone.removeEventListener('pointercancel', onUp);
    });
  }

  private bindHold(button: HTMLElement, kind: 'kick' | 'sprint'): void {
    const onDown = (event: PointerEvent) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      button.classList.add('is-pressed');
      if (kind === 'kick') this.kickPointer = event.pointerId;
      else this.sprintPointer = event.pointerId;
    };
    const onUp = (event: PointerEvent) => {
      if (kind === 'kick') {
        if (this.kickPointer !== event.pointerId) return;
        this.kickPointer = null;
        this.kickReleasePending = true;
      } else {
        if (this.sprintPointer !== event.pointerId) return;
        this.sprintPointer = null;
      }
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

  readAxes(): { x: number; z: number } {
    if (!this.joystick) return { x: 0, z: 0 };
    // Screen Y grows downwards; forward on the stick is -Y.
    return { x: this.joystick.x, z: -this.joystick.y };
  }

  get sprinting(): boolean {
    return this.sprintPointer !== null;
  }

  get charging(): boolean {
    return this.kickPointer !== null;
  }

  consumeKickRelease(): boolean {
    const value = this.kickReleasePending;
    this.kickReleasePending = false;
    return value;
  }

  consumeTackle(): boolean {
    const value = this.tacklePending;
    this.tacklePending = false;
    return value;
  }

  clear(): void {
    if (this.kickPointer !== null) {
      this.kickPointer = null;
      this.kickReleasePending = true;
    }
    this.sprintPointer = null;
    this.joystick = null;
    this.stickBase.classList.remove('is-active');
    this.kickButton.classList.remove('is-pressed');
    this.sprintButton.classList.remove('is-pressed');
  }

  dispose(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
    this.root.remove();
  }
}

function createButton(className: string, label: string, ariaLabel: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.setAttribute('aria-label', ariaLabel);
  return button;
}
