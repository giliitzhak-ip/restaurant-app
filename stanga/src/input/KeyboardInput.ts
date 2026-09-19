/** Keyboard source. Reports raw intent only; InputManager turns it into commands. */
export type KeyboardAction = 'pause' | 'toggleLoft';

const MOVE_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'KeyE',
  'KeyQ',
]);

export class KeyboardInput {
  private readonly held = new Set<string>();
  private tacklePending = false;
  private kickReleasePending = false;
  private kickWasDown = false;

  constructor(private readonly onAction: (action: KeyboardAction) => void) {}

  attach(target: Window = window): () => void {
    const onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);
    const onKeyUp = (event: KeyboardEvent) => this.handleKeyUp(event);
    const onBlur = () => this.clear();
    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    target.addEventListener('blur', onBlur);
    return () => {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
    };
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.repeat) return;
    if (MOVE_KEYS.has(event.code)) event.preventDefault();

    switch (event.code) {
      case 'Escape':
        this.onAction('pause');
        return;
      case 'KeyQ':
        this.onAction('toggleLoft');
        return;
      case 'KeyE':
        this.tacklePending = true;
        break;
      case 'Space':
        this.kickWasDown = true;
        break;
      default:
        break;
    }
    this.held.add(event.code);
  }

  private handleKeyUp(event: KeyboardEvent): void {
    if (event.code === 'Space' && this.kickWasDown) {
      this.kickWasDown = false;
      this.kickReleasePending = true;
    }
    this.held.delete(event.code);
  }

  clear(): void {
    this.held.clear();
    // A blur mid-charge should release the shot rather than leave it stuck.
    if (this.kickWasDown) {
      this.kickWasDown = false;
      this.kickReleasePending = true;
    }
  }

  /** -1..1 on each axis, before normalization. */
  readAxes(): { x: number; z: number } {
    let x = 0;
    let z = 0;
    if (this.held.has('KeyW') || this.held.has('ArrowUp')) z += 1;
    if (this.held.has('KeyS') || this.held.has('ArrowDown')) z -= 1;
    if (this.held.has('KeyD') || this.held.has('ArrowRight')) x += 1;
    if (this.held.has('KeyA') || this.held.has('ArrowLeft')) x -= 1;
    return { x, z };
  }

  get sprinting(): boolean {
    return this.held.has('ShiftLeft') || this.held.has('ShiftRight');
  }

  get charging(): boolean {
    return this.kickWasDown;
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
}
