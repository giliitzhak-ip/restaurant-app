/**
 * Fixed-timestep driver. The renderer may run at any rate; the simulation always
 * advances in whole ticks of exactly `fixedDeltaSeconds`. This is the property an
 * authoritative server needs, and the reason the loop lives outside the renderer.
 */
import { GameConfig } from '../config/GameConfig';

export type StepFn = (fixedDelta: number, tick: number) => void;

export class SimulationLoop {
  private accumulatorMs = 0;
  private tick = 0;
  /** Fractional progress towards the next tick, for render interpolation. */
  private alphaValue = 0;

  constructor(private readonly step: StepFn) {}

  get currentTick(): number {
    return this.tick;
  }

  get alpha(): number {
    return this.alphaValue;
  }

  /** Feeds one rendered frame's delta. Returns how many simulation ticks ran. */
  advance(frameDeltaMs: number): number {
    const { fixedDeltaMs, fixedDeltaSeconds, maxTicksPerFrame, maxFrameDeltaMs } =
      GameConfig.simulation;

    // A long pause (background tab, stalled frame) must not be simulated at once.
    this.accumulatorMs += Math.min(frameDeltaMs, maxFrameDeltaMs);

    let steps = 0;
    while (this.accumulatorMs >= fixedDeltaMs && steps < maxTicksPerFrame) {
      this.accumulatorMs -= fixedDeltaMs;
      this.tick += 1;
      steps += 1;
      this.step(fixedDeltaSeconds, this.tick);
    }

    // Drop the backlog rather than spiralling.
    if (this.accumulatorMs > fixedDeltaMs * maxTicksPerFrame) {
      this.accumulatorMs = 0;
    }

    this.alphaValue = this.accumulatorMs / fixedDeltaMs;
    return steps;
  }

  /** Clears the backlog, e.g. after the tab was hidden or the match restarted. */
  reset(): void {
    this.accumulatorMs = 0;
    this.alphaValue = 0;
  }

  resetTicks(): void {
    this.tick = 0;
    this.reset();
  }
}
