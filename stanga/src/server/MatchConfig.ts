/**
 * What makes one online mode different from another.
 *
 * Stage 3 ships a single config (1×1). It exists as data rather than as
 * `if (mode === ...)` branches so stage 4 can add 2×2 by adding a config and a
 * room subclass, not a second system.
 */
import type { OnlineMode } from '../net/protocol';
import type { TeamId } from '../game/MatchState';

export interface Seat {
  /** Simulation identity. Fixed per mode; clients never choose it. */
  readonly playerId: string;
  readonly team: TeamId;
}

export interface MatchConfig {
  readonly mode: OnlineMode;
  readonly maxPlayers: number;
  readonly playersPerTeam: number;
  /** Seats in join order. Length must equal `maxPlayers`. */
  readonly seats: readonly Seat[];

  /** Seconds between both players being ready and kick-off. */
  readonly lobbyCountdownSeconds: number;
  /** How long a dropped player keeps their seat. */
  readonly reconnectGraceSeconds: number;
  /** How long a room with nobody in it survives, so a reload can come back. */
  readonly emptyRoomTimeoutSeconds: number;
  /** Seconds after the final whistle before an un-rematched room closes. */
  readonly finishedTimeoutSeconds: number;

  /** Inputs accepted per client per second. Anything beyond is dropped. */
  readonly maxInputsPerSecond: number;
  /** Non-input messages (ready, rematch, ping) accepted per client per second. */
  readonly maxControlMessagesPerSecond: number;
  /** How many unconsumed inputs a client may bank, so nobody buys extra time. */
  readonly inputQueueLimit: number;
}

export const ONE_VS_ONE_CONFIG: MatchConfig = {
  mode: 'oneVsOne',
  maxPlayers: 2,
  playersPerTeam: 1,
  seats: [
    { playerId: 'home-1', team: 'home' },
    { playerId: 'away-1', team: 'away' },
  ],
  lobbyCountdownSeconds: 3,
  reconnectGraceSeconds: 30,
  emptyRoomTimeoutSeconds: 20,
  finishedTimeoutSeconds: 45,
  maxInputsPerSecond: 90,
  maxControlMessagesPerSecond: 10,
  inputQueueLimit: 6,
};
