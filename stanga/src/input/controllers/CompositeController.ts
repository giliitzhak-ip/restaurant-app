/**
 * Merges several controllers into one.
 *
 * Used for the single-player slot, where a keyboard and the on-screen controls
 * should both drive the same character. It is deliberately NOT used in local
 * multiplayer: there, one slot must map to exactly one physical device.
 */
import type { ControlContext, PlayerController } from '../PlayerController';
import { SequenceCounter } from '../PlayerController';
import { createPlayerCommand, resetPlayerCommand, type PlayerCommand } from '../PlayerCommand';

export class CompositeController implements PlayerController {
  readonly kind = 'keyboard' as const;
  private readonly command: PlayerCommand;
  private readonly sequence = new SequenceCounter();

  constructor(
    readonly deviceId: string,
    readonly label: string,
    private readonly sources: PlayerController[],
  ) {
    this.command = createPlayerCommand('');
  }

  isConnected(): boolean {
    return this.sources.some((source) => source.isConnected());
  }

  reset(): void {
    this.sequence.reset();
    for (const source of this.sources) source.reset();
  }

  poll(playerId: string, tickId: number, context: ControlContext): PlayerCommand {
    const merged = this.command;
    merged.playerId = playerId;
    resetPlayerCommand(merged, tickId, this.sequence.next());

    // Every source is polled, so none of them accumulates stale edge state.
    for (const source of this.sources) {
      const command = source.poll(playerId, tickId, context);

      // Movement and aim: the source with the strongest input wins, so an idle
      // device can never cancel out an active one.
      if (Math.hypot(command.moveX, command.moveY) > Math.hypot(merged.moveX, merged.moveY)) {
        merged.moveX = command.moveX;
        merged.moveY = command.moveY;
      }
      if (Math.hypot(command.aimX, command.aimY) > Math.hypot(merged.aimX, merged.aimY)) {
        merged.aimX = command.aimX;
        merged.aimY = command.aimY;
      }

      /*
       * Aim, spin and chip were never merged, so a player on a keyboard *and*
       * a pad could not aim a high ball at all: the merged command always
       * carried a flat zero. Whichever device is saying something takes it.
       */
      if (Math.abs(command.verticalAim) > Math.abs(merged.verticalAim)) {
        merged.verticalAim = command.verticalAim;
      }
      if (Math.abs(command.spin) > Math.abs(merged.spin)) merged.spin = command.spin;
      merged.chipRequested ||= command.chipRequested;
      if (command.preferredPassSlot >= 0) merged.preferredPassSlot = command.preferredPassSlot;
      merged.passHeld ||= command.passHeld;
      merged.passPressed ||= command.passPressed;
      merged.passReleased ||= command.passReleased;
      merged.jugglePressed ||= command.jugglePressed;

      merged.sprintPressed ||= command.sprintPressed;
      merged.shootHeld ||= command.shootHeld;
      merged.shootPressed ||= command.shootPressed;
      merged.shootReleased ||= command.shootReleased;
      merged.tacklePressed ||= command.tacklePressed;
      merged.styleCycle ||= command.styleCycle;
      // The last device to change the style owns it: merging two selections
      // would give a player holding two controllers a shape neither picked.
      if (command.styleCycle) merged.shotStyle = command.shotStyle;
    }

    // Holding on one device while releasing on another is a release only if
    // nothing is still holding the shot.
    if (merged.shootHeld) merged.shootReleased = false;

    return merged;
  }

  dispose(): void {
    for (const source of this.sources) source.dispose?.();
  }
}
