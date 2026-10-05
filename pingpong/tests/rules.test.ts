import { describe, expect, it } from 'vitest';
import {
  awardPoint,
  currentServer,
  gameWinner,
  newMatch,
  newRally,
  referee,
  serverFor,
  startNextGame,
} from '../src/shared/rules';

describe('scoring', () => {
  it('a game is won at 11 with a two-point lead', () => {
    expect(gameWinner(11, 9)).toBe(0);
    expect(gameWinner(11, 10)).toBeNull();
    expect(gameWinner(10, 10)).toBeNull();
    expect(gameWinner(12, 10)).toBe(0);
    expect(gameWinner(13, 15)).toBe(1);
    expect(gameWinner(10, 0)).toBeNull();
    expect(gameWinner(11, 0)).toBe(0);
  });

  it('deuce continues until someone leads by two', () => {
    const m = newMatch(1, 0);
    for (let i = 0; i < 10; i++) {
      awardPoint(m, 0);
      awardPoint(m, 1);
    }
    expect(m.points).toEqual([10, 10]);
    expect(awardPoint(m, 0).gameWinner).toBeNull(); // 11-10
    expect(awardPoint(m, 1).gameWinner).toBeNull(); // 11-11
    expect(awardPoint(m, 1).gameWinner).toBeNull(); // 11-12
    const r = awardPoint(m, 1); // 11-13
    expect(r.gameWinner).toBe(1);
    expect(r.matchWinner).toBe(1);
    expect(m.winner).toBe(1);
  });

  it('serve alternates every two points', () => {
    const seq = [];
    for (let total = 0; total < 10; total++) seq.push(serverFor(total, 0, 0));
    expect(seq).toEqual([0, 0, 1, 1, 0, 0, 1, 1, 0, 0]);
    expect(serverFor(1, 1, 1)).toBe(0);
    expect(serverFor(3, 2, 1)).toBe(1);
  });

  it('serve alternates every point from 10-10', () => {
    const at = (a: number, b: number) => serverFor(a, b, 0);
    expect(at(10, 9)).toBe(at(9, 10)); // still pairs before deuce
    const s1010 = at(10, 10);
    expect(at(11, 10)).not.toBe(s1010);
    expect(at(11, 11)).toBe(s1010);
    expect(at(12, 11)).not.toBe(s1010);
    expect(at(12, 12)).toBe(s1010);
    // Continuity with the regular rotation: 20 points played -> 10 switches -> first server.
    expect(s1010).toBe(0);
  });

  it('best of three: first to two games, first server alternates per game', () => {
    const m = newMatch(3, 1);
    expect(currentServer(m)).toBe(1);
    for (let i = 0; i < 11; i++) awardPoint(m, 0);
    expect(m.games).toEqual([1, 0]);
    expect(m.winner).toBeNull();
    startNextGame(m);
    expect(m.points).toEqual([0, 0]);
    expect(currentServer(m)).toBe(0);
    let r;
    for (let i = 0; i < 11; i++) r = awardPoint(m, 1);
    expect(r!.gameWinner).toBe(1);
    expect(m.winner).toBeNull();
    startNextGame(m);
    expect(currentServer(m)).toBe(1);
    for (let i = 0; i < 11; i++) r = awardPoint(m, 0);
    expect(r!.matchWinner).toBe(0);
    expect(m.games).toEqual([2, 1]);
    // No further points after the match is decided.
    awardPoint(m, 1);
    expect(m.points[1]).toBe(0);
  });
});

describe('rally referee', () => {
  it('legal serve then a returned ball continues the rally', () => {
    const r = newRally(0);
    expect(referee(r, { type: 'table', side: 0 })).toBeNull();
    expect(referee(r, { type: 'table', side: 1 })).toBeNull();
    expect(r.stage).toBe('rally');
    expect(referee(r, { type: 'paddle', side: 1, z: -1.6 })).toBeNull();
    expect(referee(r, { type: 'table', side: 0 })).toBeNull();
    expect(referee(r, { type: 'paddle', side: 0, z: 1.6 })).toBeNull();
    expect(r.lastHitter).toBe(0);
  });

  it('serve must bounce on the server side first', () => {
    const r = newRally(0);
    expect(referee(r, { type: 'table', side: 1 })).toEqual({ kind: 'point', winner: 1, reason: 'serveFault' });
  });

  it('serve that bounces twice on the server side is a fault', () => {
    const r = newRally(1);
    referee(r, { type: 'table', side: 1 });
    expect(referee(r, { type: 'table', side: 1 })).toMatchObject({ kind: 'point', winner: 0 });
  });

  it('serve that misses the receiver half is a fault', () => {
    const r = newRally(0);
    referee(r, { type: 'table', side: 0 });
    expect(referee(r, { type: 'floor' })).toMatchObject({ kind: 'point', winner: 1, reason: 'serveFault' });
  });

  it('serve touching the net and landing legally is a let', () => {
    const r = newRally(0);
    referee(r, { type: 'table', side: 0 });
    referee(r, { type: 'net' });
    expect(referee(r, { type: 'table', side: 1 })).toEqual({ kind: 'let' });
  });

  it('serve touching the net and not landing is a point for the receiver', () => {
    const r = newRally(0);
    referee(r, { type: 'table', side: 0 });
    referee(r, { type: 'net' });
    expect(referee(r, { type: 'table', side: 0 })).toMatchObject({ kind: 'point', winner: 1, reason: 'serveNet' });
  });

  it('double bounce on the receiver side gives the point to the hitter', () => {
    const r = newRally(0);
    referee(r, { type: 'table', side: 0 });
    referee(r, { type: 'table', side: 1 });
    expect(referee(r, { type: 'table', side: 1 })).toEqual({ kind: 'point', winner: 0, reason: 'doubleBounce' });
  });

  it('a shot that misses the table loses the point (out)', () => {
    const r = newRally(0);
    referee(r, { type: 'table', side: 0 });
    referee(r, { type: 'table', side: 1 });
    referee(r, { type: 'paddle', side: 1, z: -1.6 });
    expect(referee(r, { type: 'floor' })).toEqual({ kind: 'point', winner: 0, reason: 'out' });
  });

  it('a shot into the net that drops back loses the point', () => {
    const r = newRally(0);
    referee(r, { type: 'table', side: 0 });
    referee(r, { type: 'table', side: 1 });
    referee(r, { type: 'paddle', side: 1, z: -1.6 });
    referee(r, { type: 'net' });
    expect(referee(r, { type: 'table', side: 1 })).toEqual({ kind: 'point', winner: 0, reason: 'net' });
  });

  it('missing a ball that bounced on your side loses the point', () => {
    const r = newRally(0);
    referee(r, { type: 'table', side: 0 });
    referee(r, { type: 'table', side: 1 });
    expect(referee(r, { type: 'floor' })).toEqual({ kind: 'point', winner: 0, reason: 'missed' });
  });

  it('hitting the ball over the table before it bounces is illegal (volley)', () => {
    const r = newRally(0);
    referee(r, { type: 'table', side: 0 });
    referee(r, { type: 'table', side: 1 });
    referee(r, { type: 'paddle', side: 1, z: -1.6 });
    expect(referee(r, { type: 'paddle', side: 0, z: 1.0 })).toEqual({ kind: 'point', winner: 1, reason: 'volley' });
  });

  it('touching a ball that already flew past the end line does not save the hitter', () => {
    const r = newRally(0);
    referee(r, { type: 'table', side: 0 });
    referee(r, { type: 'table', side: 1 });
    referee(r, { type: 'paddle', side: 1, z: -1.6 });
    expect(referee(r, { type: 'paddle', side: 0, z: 1.8 })).toEqual({ kind: 'point', winner: 0, reason: 'out' });
  });

  it('hitting twice in a row is illegal', () => {
    const r = newRally(0);
    referee(r, { type: 'table', side: 0 });
    referee(r, { type: 'table', side: 1 });
    referee(r, { type: 'paddle', side: 1, z: -1.6 });
    expect(referee(r, { type: 'paddle', side: 1, z: -1.4 })).toEqual({ kind: 'point', winner: 0, reason: 'doubleHit' });
  });

  it('a return that lands on the hitter own side loses the point', () => {
    const r = newRally(1);
    referee(r, { type: 'table', side: 1 });
    referee(r, { type: 'table', side: 0 });
    referee(r, { type: 'paddle', side: 0, z: 1.6 });
    expect(referee(r, { type: 'table', side: 0 })).toEqual({ kind: 'point', winner: 1, reason: 'ownSide' });
  });

  it('receiver volleying the serve loses the point; a long serve touched behind the end is a fault', () => {
    const a = newRally(0);
    referee(a, { type: 'table', side: 0 });
    expect(referee(a, { type: 'paddle', side: 1, z: -1.0 })).toMatchObject({ winner: 0, reason: 'volley' });
    const b = newRally(0);
    referee(b, { type: 'table', side: 0 });
    expect(referee(b, { type: 'paddle', side: 1, z: -1.7 })).toMatchObject({ winner: 1, reason: 'serveFault' });
  });
});
