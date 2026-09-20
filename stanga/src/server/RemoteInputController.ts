/**
 * A player driven by a network client.
 *
 * This is the swap point stage 2 was designed around: the server builds a
 * `MatchSession` out of `PlayerSlot`s exactly like the local game does, and the
 * simulation cannot tell a remote player from a keyboard.
 *
 * Inputs are queued rather than latched, because the socket delivers them in
 * bursts. One queued input is consumed per tick; when the queue runs dry the
 * last movement is repeated with the edge flags cleared, so a held direction
 * survives a late packet while a kick never fires twice.
 */
import {
  createPlayerCommand,
  resetPlayerCommand,
  type PlayerCommand,
} from '../input/PlayerCommand';
import type { ControllerKind, PlayerController } from '../input/PlayerController';
import { InputFlag, toPlayerCommand, type NetInput } from '../net/protocol';

export class RemoteInputController implements PlayerController {
  readonly kind: ControllerKind = 'network';

  private readonly queue: NetInput[] = [];
  private readonly command: PlayerCommand;
  private lastConsumed: NetInput | null = null;
  private acknowledged = 0;
  private connected = true;

  constructor(
    readonly deviceId: string,
    readonly label: string,
    private readonly queueLimit: number,
  ) {
    this.command = createPlayerCommand(deviceId, 0);
  }

  /** Last input sequence number the simulation actually consumed. */
  get lastProcessedSequence(): number {
    return this.acknowledged;
  }

  get pending(): number {
    return this.queue.length;
  }

  /**
   * Accepts one validated input. Out-of-order and replayed packets are dropped:
   * a client must not be able to replay a kick by resending its sequence.
   */
  enqueue(input: NetInput): void {
    if (input.n <= this.acknowledged) return;
    const last = this.queue[this.queue.length - 1];
    if (last && input.n <= last.n) return;
    this.queue.push(input);
    // A client that banks inputs would get a burst of free actions later, so
    // the oldest are dropped instead of the newest: intent stays current.
    while (this.queue.length > this.queueLimit) this.queue.shift();
  }

  poll(playerId: string, tickId: number): PlayerCommand {
    const next = this.queue.shift();
    if (next) {
      this.lastConsumed = next;
      this.acknowledged = next.n;
      return toPlayerCommand(playerId, tickId, next, this.command);
    }

    // Nothing new arrived. Level flags (direction, sprint, shoot held) carry
    // over so a late packet does not stutter the player or cancel a wind-up.
    // Edge flags never repeat: one packet must never fire two kicks.
    const held = this.lastConsumed;
    resetPlayerCommand(this.command, tickId, this.acknowledged);
    this.command.playerId = playerId;
    if (held && this.connected) {
      this.command.moveX = held.mx;
      this.command.moveY = held.my;
      this.command.aimX = held.ax;
      this.command.aimY = held.ay;
      this.command.sprintPressed = (held.f & InputFlag.Sprint) !== 0;
      this.command.shootHeld = (held.f & InputFlag.ShootHeld) !== 0;
      this.command.passHeld = (held.f & InputFlag.PassHeld) !== 0;
      this.command.chipRequested = (held.f & InputFlag.ChipRequested) !== 0;
      this.command.verticalAim = held.va;
      this.command.spin = held.sn;
      this.command.preferredPassSlot = held.pt;
    }
    return this.command;
  }

  /** Drops every held input. Used on disconnect, pause and kickoff. */
  reset(): void {
    this.queue.length = 0;
    this.lastConsumed = null;
  }

  setConnected(connected: boolean): void {
    this.connected = connected;
    if (!connected) this.reset();
  }

  isConnected(): boolean {
    return this.connected;
  }
}
