/**
 * Who is on the pitch.
 *
 * Up to 0.3.0 the match was two hard-coded players. A roster turns that into
 * data: a list of seats, each with a team and a slot inside it. The same
 * simulation, the same rules and the same server code then serve 1×1 and 2×2
 * without a single `if (mode === ...)`.
 */
import { GameConfig } from '../config/GameConfig';
import { vec3, type Vec3 } from '../core/math';
import type { TeamId } from './MatchState';

export interface RosterEntry {
  readonly playerId: string;
  readonly team: TeamId;
  /** Position within the team, 0-based. Decides where the player kicks off. */
  readonly slotIndex: number;
}

export interface MatchRoster {
  readonly playersPerTeam: number;
  readonly entries: readonly RosterEntry[];
}

export const ONE_VS_ONE_ROSTER: MatchRoster = {
  playersPerTeam: 1,
  entries: [
    { playerId: 'home-1', team: 'home', slotIndex: 0 },
    { playerId: 'away-1', team: 'away', slotIndex: 0 },
  ],
};

export const TWO_VS_TWO_ROSTER: MatchRoster = {
  playersPerTeam: 2,
  entries: [
    { playerId: 'home-1', team: 'home', slotIndex: 0 },
    { playerId: 'home-2', team: 'home', slotIndex: 1 },
    { playerId: 'away-1', team: 'away', slotIndex: 0 },
    { playerId: 'away-2', team: 'away', slotIndex: 1 },
  ],
};

export function rosterFor(playersPerTeam: number): MatchRoster {
  return playersPerTeam >= 2 ? TWO_VS_TWO_ROSTER : ONE_VS_ONE_ROSTER;
}

/** Which way a team faces at kick-off: home defends -Z, away defends +Z. */
export function defendingSign(team: TeamId): number {
  return team === 'home' ? -1 : 1;
}

/**
 * Where a player stands for a kick-off.
 *
 * The team taking it starts near the centre; the other team stands off. With
 * two per side, slot 0 takes the near position and slot 1 spreads sideways so
 * nobody starts inside a team-mate.
 */
export function kickoffPosition(entry: RosterEntry, roster: MatchRoster, kicksOff: boolean): Vec3 {
  const halfLength = GameConfig.field.length / 2;
  const halfWidth = GameConfig.field.width / 2;
  const sign = defendingSign(entry.team);

  const depth = kicksOff ? halfLength * 0.13 : halfLength * 0.42;
  if (roster.playersPerTeam < 2) return vec3(0, 0, sign * depth);

  // Slot 0 pushes up, slot 1 sits back and wide — a striker and a sweeper.
  const forward = entry.slotIndex === 0 ? depth : depth + halfLength * 0.3;
  const side = entry.slotIndex === 0 ? -halfWidth * 0.28 : halfWidth * 0.3;
  return vec3(side * (sign < 0 ? 1 : -1), 0, sign * forward);
}

/** Facing at kick-off: everyone looks at the opponent's goal. */
export function kickoffFacing(entry: RosterEntry): number {
  return defendingSign(entry.team) < 0 ? 0 : Math.PI;
}

/** Default kit index, so the two teams never start in the same colours. */
export function defaultColorId(entry: RosterEntry): number {
  return entry.team === 'home' ? 0 : 1;
}

/** Stable display name before a real one arrives. */
export function defaultName(entry: RosterEntry, roster: MatchRoster): string {
  if (roster.playersPerTeam < 2) return entry.team === 'home' ? 'שחקן 1' : 'שחקן 2';
  const teamName = entry.team === 'home' ? 'כתום' : 'כחול';
  return `${teamName} ${entry.slotIndex + 1}`;
}
