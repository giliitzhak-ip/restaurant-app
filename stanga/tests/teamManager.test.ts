/**
 * Teams and seats belong to the server.
 *
 * These are the rules that stop four clients arguing about who is on which
 * side — and the ones that stop a client deciding it is on both.
 */
import { describe, expect, it } from 'vitest';
import { ONE_VS_ONE_CONFIG, TWO_VS_TWO_CONFIG } from '../src/game/MatchConfig';
import { LobbyManager } from '../src/server/LobbyManager';
import { TeamManager } from '../src/server/TeamManager';

describe('TeamManager', () => {
  it('fills a 2×2 room two per side', () => {
    const teams = new TeamManager(TWO_VS_TWO_CONFIG);
    for (const session of ['a', 'b', 'c', 'd']) teams.claim(session);

    expect(teams.countByTeam()).toEqual({ home: 2, away: 2 });
    expect(teams.teamsComplete()).toBe(true);
    expect(teams.freeSeatCount()).toBe(0);
  });

  it('balances as players arrive rather than filling one side first', () => {
    const teams = new TeamManager(TWO_VS_TWO_CONFIG);
    teams.claim('a');
    teams.claim('b');
    const counts = teams.countByTeam();
    expect(counts.home).toBe(1);
    expect(counts.away).toBe(1);
  });

  it('refuses a fifth player', () => {
    const teams = new TeamManager(TWO_VS_TWO_CONFIG);
    for (const session of ['a', 'b', 'c', 'd']) teams.claim(session);
    expect(teams.claim('e')).toBeNull();
  });

  it('never gives one session two seats', () => {
    const teams = new TeamManager(TWO_VS_TWO_CONFIG);
    expect(teams.claim('a')).not.toBeNull();
    expect(teams.claim('a')).toBeNull();
    expect(teams.occupied()).toHaveLength(1);
  });

  it('allows a team switch only when there is room', () => {
    const teams = new TeamManager(TWO_VS_TWO_CONFIG);
    teams.claim('a');
    teams.claim('b');
    teams.claim('c');

    // Three players means one side is two deep and the other has room.
    const counts = teams.countByTeam();
    const fullTeam = counts.home === 2 ? 'home' : 'away';
    const openTeam = fullTeam === 'home' ? 'away' : 'home';

    const onOpenTeam = teams
      .occupied()
      .find((assignment) => assignment.seat.team === openTeam)?.sessionId;
    const onFullTeam = teams
      .occupied()
      .find((assignment) => assignment.seat.team === fullTeam)?.sessionId;

    // Into the full side: refused. Out of it: fine.
    expect(teams.requestSwitch(onOpenTeam ?? '', fullTeam, false)).toBe('teamFull');
    expect(teams.requestSwitch(onFullTeam ?? '', openTeam, false)).toBe('ok');
    expect(teams.countByTeam()[openTeam]).toBe(2);
    // And asking for the side you are already on changes nothing.
    expect(teams.requestSwitch(onOpenTeam ?? '', openTeam, false)).toBe('unchanged');
  });

  it('refuses a team switch once the teams are locked', () => {
    const teams = new TeamManager(TWO_VS_TWO_CONFIG);
    teams.claim('a');
    expect(teams.requestSwitch('a', 'away', true)).toBe('locked');
  });

  it('refuses a switch from somebody who is not in the room', () => {
    const teams = new TeamManager(TWO_VS_TWO_CONFIG);
    expect(teams.requestSwitch('ghost', 'away', false)).toBe('noSeat');
  });

  it('keeps the teams even when it shuffles', () => {
    const teams = new TeamManager(TWO_VS_TWO_CONFIG);
    for (const session of ['a', 'b', 'c', 'd']) teams.claim(session);

    let sequence = 0;
    const fixed = [0.9, 0.1, 0.7, 0.3];
    teams.shuffle(() => fixed[sequence++ % fixed.length] ?? 0);

    expect(teams.countByTeam()).toEqual({ home: 2, away: 2 });
    expect(new Set(teams.occupied().map((a) => a.sessionId)).size).toBe(4);
  });

  it('leaves a player who is already ready exactly where they are', () => {
    const teams = new TeamManager(TWO_VS_TWO_CONFIG);
    for (const session of ['a', 'b', 'c', 'd']) teams.claim(session);
    const seatOfA = teams.seatFor('a')?.seat.playerId;

    // The host may propose a shuffle, but not drag somebody who has committed.
    teams.shuffle(() => 0.5, new Set(['a']));
    expect(teams.seatFor('a')?.seat.playerId).toBe(seatOfA);
    expect(new Set(teams.occupied().map((assignment) => assignment.sessionId)).size).toBe(4);
  });

  it('shuffles into the seats that are taken, not into empty ones', () => {
    const teams = new TeamManager(TWO_VS_TWO_CONFIG);
    teams.claim('a');
    teams.claim('b');
    const before = teams.countByTeam();

    teams.shuffle(() => 0.9);

    // Two players in a four-seat room stay one a side: a shuffle must not
    // quietly compact them onto the same team.
    expect(teams.countByTeam()).toEqual(before);
    expect(teams.occupied()).toHaveLength(2);
  });

  it('frees a seat when a player leaves, and fills it again', () => {
    const teams = new TeamManager(TWO_VS_TWO_CONFIG);
    for (const session of ['a', 'b', 'c', 'd']) teams.claim(session);
    teams.release('b');
    expect(teams.freeSeatCount()).toBe(1);
    expect(teams.teamsComplete()).toBe(false);
    expect(teams.claim('e')).not.toBeNull();
    expect(teams.teamsComplete()).toBe(true);
  });

  it('still works for 1×1, which is the same code with two seats', () => {
    const teams = new TeamManager(ONE_VS_ONE_CONFIG);
    teams.claim('a');
    teams.claim('b');
    expect(teams.teamsComplete()).toBe(true);
    expect(teams.claim('c')).toBeNull();
  });
});

describe('LobbyManager', () => {
  it('makes the first player the host and hands it over when they go', () => {
    const lobby = new LobbyManager();
    lobby.add('a');
    lobby.add('b');
    expect(lobby.isHost('a')).toBe(true);
    expect(lobby.isHost('b')).toBe(false);

    lobby.remove('a', ['b']);
    expect(lobby.host).toBe('b');
  });

  it('needs everybody to be ready, not just somebody', () => {
    const lobby = new LobbyManager();
    lobby.setReady('a', true);
    expect(lobby.everyoneReady(['a', 'b'])).toBe(false);
    lobby.setReady('b', true);
    expect(lobby.everyoneReady(['a', 'b'])).toBe(true);
  });

  it('is never ready with nobody in the room', () => {
    expect(new LobbyManager().everyoneReady([])).toBe(false);
  });

  it('forgets a leaving player readiness', () => {
    const lobby = new LobbyManager();
    lobby.setReady('a', true);
    lobby.remove('a', []);
    expect(lobby.isReady('a')).toBe(false);
  });
});
