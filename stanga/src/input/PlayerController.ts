/**
 * The controller contract.
 *
 * Every source of intent — keyboard profile, gamepad, touch pad, AI, and later a
 * network client — implements this and nothing more. `MatchSession` polls each
 * controller once per simulation tick and hands the result to the engine.
 */
import type { MatchState, PlayerState } from '../game/MatchState';
import type { PlayerCommand } from './PlayerCommand';

export type ControllerKind = 'keyboard' | 'gamepad' | 'touch' | 'ai' | 'network';

/** Everything a controller may read when deciding what to do this tick. */
export interface ControlContext {
  /** Yaw that camera-relative movement is expressed in. */
  cameraYaw: number;
  /** The player this controller drives, if the simulation knows about it yet. */
  player: PlayerState | undefined;
  /** Read-only view of the match, for the AI. Human controllers ignore it. */
  state: MatchState;
  /** Seconds in this tick. */
  dt: number;
}

export interface PlayerController {
  /**
   * Stable identity of the physical device behind this controller.
   * Two slots may never share a deviceId — that is what stops one keyboard half
   * or one gamepad from driving both players.
   */
  readonly deviceId: string;
  readonly kind: ControllerKind;
  /** Human-readable, already localized, e.g. "בקר 1" or "מקלדת — צד שמאל". */
  readonly label: string;

  /** Produces the command for one simulation tick. */
  poll(playerId: string, tickId: number, context: ControlContext): PlayerCommand;

  /** Drops any held state. Called on pause, focus loss and match reset. */
  reset(): void;

  /** True when the underlying device is still usable. */
  isConnected(): boolean;

  dispose?(): void;
}

/** Shared sequence numbering, so every controller reports a monotonic counter. */
export class SequenceCounter {
  private value = 0;

  next(): number {
    this.value += 1;
    return this.value;
  }

  reset(): void {
    this.value = 0;
  }
}
