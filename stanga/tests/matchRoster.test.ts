/**
 * The line-up is data now, not two hard-coded players. These tests hold the
 * line that 1×1 and 2×2 are the same simulation with a different roster.
 */
import { describe, expect, it } from 'vitest';
import { GameConfig } from '../src/config/GameConfig';
import {
  ONE_VS_ONE_ROSTER,
  TWO_VS_TWO_ROSTER,
  kickoffFacing,
  kickoffPosition,
  rosterFor,
} from '../src/game/MatchRoster';
import { createMatchState } from '../src/game/MatchState';
import { resetForKickoff } from '../src/game/MatchRules';

describe('match roster', () => {
  it('gives each team the same number of players', () => {
    expect(ONE_VS_ONE_ROSTER.entries).toHaveLength(2);
    expect(TWO_VS_TWO_ROSTER.entries).toHaveLength(4);
    for (const roster of [ONE_VS_ONE_ROSTER, TWO_VS_TWO_ROSTER]) {
      const home = roster.entries.filter((entry) => entry.team === 'home');
      const away = roster.entries.filter((entry) => entry.team === 'away');
      expect(home).toHaveLength(roster.playersPerTeam);
      expect(away).toHaveLength(roster.playersPerTeam);
      // Ids are unique, which the server relies on to resolve a seat.
      expect(new Set(roster.entries.map((entry) => entry.playerId)).size).toBe(
        roster.entries.length,
      );
    }
  });

  it('builds a match state straight from a roster', () => {
    const state = createMatchState(TWO_VS_TWO_ROSTER);
    expect(state.playersPerTeam).toBe(2);
    expect(state.players.map((player) => player.id)).toEqual([
      'home-1',
      'home-2',
      'away-1',
      'away-2',
    ]);
    expect(state.players.map((player) => player.slotIndex)).toEqual([0, 1, 0, 1]);
  });

  it('starts everyone in their own half, facing the right goal', () => {
    for (const roster of [ONE_VS_ONE_ROSTER, TWO_VS_TWO_ROSTER]) {
      for (const entry of roster.entries) {
        const spot = kickoffPosition(entry, roster, false);
        const sign = entry.team === 'home' ? -1 : 1;
        expect(Math.sign(spot.z)).toBe(sign);
        expect(Math.abs(spot.x)).toBeLessThan(GameConfig.field.width / 2);
        expect(Math.abs(spot.z)).toBeLessThan(GameConfig.field.length / 2);
        expect(kickoffFacing(entry)).toBe(sign < 0 ? 0 : Math.PI);
      }
    }
  });

  it('never stands two team-mates on the same spot', () => {
    const roster = TWO_VS_TWO_ROSTER;
    for (const kicksOff of [true, false]) {
      const spots = roster.entries.map((entry) => kickoffPosition(entry, roster, kicksOff));
      for (let i = 0; i < spots.length; i += 1) {
        for (let j = i + 1; j < spots.length; j += 1) {
          const a = spots[i];
          const b = spots[j];
          if (!a || !b) continue;
          // Two player capsules need more than their diameter between them.
          expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(GameConfig.player.radius * 2);
        }
      }
    }
  });

  it('puts everyone back on their kickoff spot after a goal', () => {
    const state = createMatchState(TWO_VS_TWO_ROSTER);
    for (const player of state.players) {
      player.position.x = 7;
      player.position.z = 7;
      player.velocity.x = 5;
    }
    state.kickoffTeam = 'away';

    resetForKickoff(state);

    expect(state.ball.position).toEqual({ x: 0, y: GameConfig.ball.radius, z: 0 });
    for (const player of state.players) {
      const sign = player.team === 'home' ? -1 : 1;
      expect(Math.sign(player.position.z)).toBe(sign);
      expect(player.velocity).toEqual({ x: 0, y: 0, z: 0 });
    }
    // The team taking the kick-off stands nearer the centre circle.
    const kicker = state.players.find((player) => player.team === 'away');
    const waiting = state.players.find((player) => player.team === 'home');
    expect(Math.abs(kicker?.position.z ?? 0)).toBeLessThan(Math.abs(waiting?.position.z ?? 0));
  });

  it('picks a roster by team size', () => {
    expect(rosterFor(1)).toBe(ONE_VS_ONE_ROSTER);
    expect(rosterFor(2)).toBe(TWO_VS_TWO_ROSTER);
  });
});
