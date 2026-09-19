/**
 * One keyboard listener for the whole game.
 *
 * Several keyboard controllers (the split profiles) read from this shared state
 * instead of each attaching their own listeners, which keeps edge detection
 * consistent and avoids duplicated preventDefault handling.
 */
export type KeyboardEdge = 'down' | 'up';

export class KeyboardState {
  private readonly held = new Set<string>();
  private readonly pressedThisFrame = new Set<string>();
  private readonly releasedThisFrame = new Set<string>();
  /** Codes that the game owns and must not scroll or scrub the page. */
  private readonly owned = new Set<string>();
  private readonly listeners = new Set<(code: string, edge: KeyboardEdge) => void>();
  private detach: (() => void) | null = null;

  attach(target: Window = window): void {
    if (this.detach) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (this.owned.has(event.code)) event.preventDefault();
      if (event.repeat) return;
      this.held.add(event.code);
      this.pressedThisFrame.add(event.code);
      this.notify(event.code, 'down');
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (this.owned.has(event.code)) event.preventDefault();
      this.held.delete(event.code);
      this.releasedThisFrame.add(event.code);
      this.notify(event.code, 'up');
    };
    const onBlur = () => this.clear();

    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    target.addEventListener('blur', onBlur);

    this.detach = () => {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
    };
  }

  /** Registers the codes the game consumes, so the page never scrolls mid-match. */
  own(codes: Iterable<string>): void {
    for (const code of codes) this.owned.add(code);
  }

  isHeld(code: string): boolean {
    return this.held.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressedThisFrame.has(code);
  }

  wasReleased(code: string): boolean {
    return this.releasedThisFrame.has(code);
  }

  /** Subscribe to raw key edges. Used by the device-assignment screen. */
  onEdge(listener: (code: string, edge: KeyboardEdge) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Clears the one-tick edge sets. Called once per simulation tick, after every
   * controller has polled, so no controller can miss a press.
   */
  endFrame(): void {
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
  }

  /** Forgets everything, including keys physically still down. */
  clear(): void {
    // Releasing held keys keeps a charged shot from getting stuck after a blur.
    for (const code of this.held) this.releasedThisFrame.add(code);
    this.held.clear();
    this.pressedThisFrame.clear();
  }

  dispose(): void {
    this.detach?.();
    this.detach = null;
    this.listeners.clear();
    this.held.clear();
  }

  private notify(code: string, edge: KeyboardEdge): void {
    for (const listener of [...this.listeners]) listener(code, edge);
  }
}
