/**
 * What makes one online mode different from another.
 *
 * It is data rather than `if (mode === ...)` branches scattered through the
 * code: 2×2 is a second entry in this file and a room subclass, not a second
 * system. It lives beside the simulation rather than in `server/` because the
 * client reads it too — its prediction has to run with the same numbers the
 * server does.
 */
import { ONE_VS_ONE_ROSTER, TWO_VS_TWO_ROSTER, type MatchRoster } from './MatchRoster';
import type { TeamId } from './MatchState';
import type { OnlineMode } from '../net/protocol';

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
  /** The line-up the simulation runs. Must line up with `seats`. */
  readonly roster: MatchRoster;

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
  /**
   * Seconds between quick-chat phrases from one seat. The control-message
   * budget alone would still allow a dozen a second, which is spam; this is
   * the limit that makes the feature usable rather than a nuisance.
   */
  readonly quickChatCooldownSeconds: number;

  /** Seconds before a disconnected player is taken over by a bot. */
  readonly botSubstitutionSeconds: number;
  /** Seconds of match played before surrendering is allowed at all. */
  readonly surrenderAfterSeconds: number;
  /** Or: a deficit this large makes surrender available immediately. */
  readonly surrenderPointGap: number;
  /** Seconds between surrender votes from the same team. */
  readonly surrenderCooldownSeconds: number;
  /**
   * How hard team-mates push each other apart. 1 is a full collision; lower
   * values let a team-mate slide past instead of blocking their own attack.
   */
  readonly friendlyCollision: number;
}

export const ONE_VS_ONE_CONFIG: MatchConfig = {
  mode: 'oneVsOne',
  maxPlayers: 2,
  playersPerTeam: 1,
  seats: [
    { playerId: 'home-1', team: 'home' },
    { playerId: 'away-1', team: 'away' },
  ],
  roster: ONE_VS_ONE_ROSTER,
  lobbyCountdownSeconds: 3,
  reconnectGraceSeconds: 30,
  emptyRoomTimeoutSeconds: 20,
  finishedTimeoutSeconds: 45,
  maxInputsPerSecond: 90,
  maxControlMessagesPerSecond: 10,
  inputQueueLimit: 6,
  quickChatCooldownSeconds: 1.5,
  botSubstitutionSeconds: 3,
  surrenderAfterSeconds: 60,
  surrenderPointGap: 6,
  surrenderCooldownSeconds: 20,
  friendlyCollision: 1,
};

/**
 * Online 2×2. Everything that differs from 1×1 is here rather than in the
 * room: four seats, two per side, and team-mates who do not block each other.
 */
export const TWO_VS_TWO_CONFIG: MatchConfig = {
  mode: 'twoVsTwo',
  maxPlayers: 4,
  playersPerTeam: 2,
  seats: [
    { playerId: 'home-1', team: 'home' },
    { playerId: 'home-2', team: 'home' },
    { playerId: 'away-1', team: 'away' },
    { playerId: 'away-2', team: 'away' },
  ],
  roster: TWO_VS_TWO_ROSTER,
  lobbyCountdownSeconds: 4,
  reconnectGraceSeconds: 40,
  emptyRoomTimeoutSeconds: 25,
  finishedTimeoutSeconds: 60,
  maxInputsPerSecond: 90,
  maxControlMessagesPerSecond: 12,
  inputQueueLimit: 6,
  quickChatCooldownSeconds: 1.5,
  botSubstitutionSeconds: 3,
  surrenderAfterSeconds: 60,
  surrenderPointGap: 6,
  surrenderCooldownSeconds: 20,
  // Team-mates separate softly: four players around one ball turns into a
  // scrum otherwise, and being blocked by your own partner is maddening.
  friendlyCollision: 0.35,
};

export function configFor(mode: OnlineMode): MatchConfig {
  return mode === 'twoVsTwo' ? TWO_VS_TWO_CONFIG : ONE_VS_ONE_CONFIG;
}
