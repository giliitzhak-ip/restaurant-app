import { PADDLE, type Side } from '../../shared/constants';
import { type PaddleInput, READY_Y } from '../../shared/paddle';
import { clamp } from '../../shared/vec';

export type Projector = (ndcX: number, ndcY: number, planeZ: number) => { x: number; y: number } | null;

/**
 * Turns mouse, keyboard and touch into a PaddleInput. Mouse: the paddle follows the
 * cursor projected onto the paddle's plane. Keyboard: arrows/WASD move it. Touch: a
 * dedicated pad maps finger position to paddle position, away from the ball.
 */
export class InputController {
  private target = { x: 0, y: READY_Y };
  private tilt = 0;
  private act = 0;
  private mouseTop = false;
  private mouseBack = false;
  private keys = new Set<string>();
  private touch = { top: false, back: false, power: false };
  private pointer: { x: number; y: number } | null = null;
  private source: 'mouse' | 'keys' | 'touch' = 'mouse';
  private disposers: (() => void)[] = [];
  sensitivity = 1;
  enabled = true;
  /** Called when the player asks to pause (Esc). */
  onPause: (() => void) | null = null;
  /** Called on any first interaction (for unlocking audio). */
  onInteract: (() => void) | null = null;

  constructor(el: HTMLElement) {
    const on = <K extends keyof HTMLElementEventMap>(t: K, f: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions) => {
      el.addEventListener(t, f as EventListener, o);
      this.disposers.push(() => el.removeEventListener(t, f as EventListener, o));
    };
    const onWin = <K extends keyof WindowEventMap>(t: K, f: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(t, f as EventListener);
      this.disposers.push(() => window.removeEventListener(t, f as EventListener));
    };

    on('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = el.getBoundingClientRect();
      this.pointer = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1) };
      this.source = 'mouse';
    });
    on('pointerdown', (e) => {
      this.onInteract?.();
      if (e.pointerType !== 'mouse' || !this.enabled) return;
      if (e.button === 0) {
        this.mouseTop = true;
        this.serve();
      } else if (e.button === 2) this.mouseBack = true;
    });
    onWin('pointerup', (e) => {
      if (e.pointerType !== 'mouse') return;
      if (e.button === 0) this.mouseTop = false;
      if (e.button === 2) this.mouseBack = false;
    });
    on('contextmenu', (e) => e.preventDefault());
    on(
      'wheel',
      (e) => {
        e.preventDefault();
        this.tilt = clamp(this.tilt - Math.sign(e.deltaY) * 0.15, -1, 1);
      },
      { passive: false },
    );
    onWin('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      this.onInteract?.();
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        this.onPause?.();
        return;
      }
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (k === ' ' || k === 'enter') {
        if (!e.repeat) this.serve();
        return;
      }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) this.source = 'keys';
      this.keys.add(k);
    });
    onWin('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    onWin('blur', () => {
      this.keys.clear();
      this.mouseTop = this.mouseBack = false;
    });
  }

  serve(): void {
    if (this.enabled) this.act = (this.act + 1) & 0xffff;
  }

  /** Touch pad: nx, ny in 0..1 (0,0 = bottom-left of the pad). */
  setTouchPad(nx: number, ny: number): void {
    this.source = 'touch';
    const s = this.sensitivity;
    const x = (nx * 2 - 1) * 1.1 * s;
    const y = READY_Y + (ny - 0.45) * 0.75 * s;
    this.target = { x: clamp(x, PADDLE.minX, PADDLE.maxX), y: clamp(y, PADDLE.minY, PADDLE.maxY) };
  }

  setTouchButton(b: 'top' | 'back' | 'power', down: boolean): void {
    this.touch[b] = down;
  }

  setTilt(t: number): void {
    this.tilt = clamp(t, -1, 1);
  }

  getTilt(): number {
    return this.tilt;
  }

  /**
   * Sample the current intent. `side` is the local player's side, `planeZ` the
   * paddle's current z and `project` maps the cursor into the world.
   */
  sample(dt: number, side: Side, planeZ: number, project: Projector): PaddleInput {
    const mirror = side === 0 ? 1 : -1;
    if (this.source === 'mouse' && this.pointer) {
      const hit = project(this.pointer.x, this.pointer.y, planeZ);
      if (hit) {
        // Sensitivity scales the offset from the table centre / ready height.
        this.target = {
          x: clamp(hit.x * this.sensitivity, PADDLE.minX, PADDLE.maxX),
          y: clamp(READY_Y + (hit.y - READY_Y) * this.sensitivity, PADDLE.minY, PADDLE.maxY),
        };
      }
    } else if (this.source === 'keys') {
      const sp = 1.7 * this.sensitivity * dt;
      const k = this.keys;
      const dx = (k.has('arrowright') || k.has('d') ? 1 : 0) - (k.has('arrowleft') || k.has('a') ? 1 : 0);
      const dy = (k.has('arrowup') || k.has('w') ? 1 : 0) - (k.has('arrowdown') || k.has('s') ? 1 : 0);
      this.target = {
        x: clamp(this.target.x + dx * sp * mirror, PADDLE.minX, PADDLE.maxX),
        y: clamp(this.target.y + dy * sp * 0.6, PADDLE.minY, PADDLE.maxY),
      };
    }
    if (this.source === 'touch') this.target.x = clamp(this.target.x, PADDLE.minX, PADDLE.maxX);
    const k = this.keys;
    if (k.has('q')) this.tilt = clamp(this.tilt - dt * 1.6, -1, 1);
    if (k.has('e')) this.tilt = clamp(this.tilt + dt * 1.6, -1, 1);
    const top = this.mouseTop || k.has('z') || k.has('j') || this.touch.top;
    const back = this.mouseBack || k.has('x') || k.has('k') || this.touch.back;
    const power = k.has('shift') || this.touch.power;
    const x = this.source === 'touch' ? this.target.x * mirror : this.target.x;
    return {
      x,
      y: this.target.y,
      tilt: this.tilt,
      spin: top && !back ? 1 : back && !top ? -1 : 0,
      power,
      act: this.act,
    };
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
  }
}
