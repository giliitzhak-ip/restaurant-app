import { RULES, TABLE, other, type Side } from './constants';

// ───────────────────────────── Match scoring ─────────────────────────────

export interface MatchState {
  points: [number, number];
  games: [number, number];
  /** 0-based index of the game being played. */
  gameNo: number;
  pointsToWin: number;
  bestOf: 1 | 3 | 5;
  /** Who served first in game 0; the first server alternates each game. */
  firstServer: Side;
  winner: Side | null;
}

export function newMatch(bestOf: 1 | 3 | 5 = 1, firstServer: Side = 0, pointsToWin: number = RULES.pointsToWin): MatchState {
  return { points: [0, 0], games: [0, 0], gameNo: 0, pointsToWin, bestOf, firstServer, winner: null };
}

export const gamesToWin = (m: MatchState): number => Math.floor(m.bestOf / 2) + 1;

/** A game is won at `pointsToWin` with a lead of at least two. */
export function gameWinner(a: number, b: number, pointsToWin: number = RULES.pointsToWin): Side | null {
  if (a >= pointsToWin && a - b >= RULES.winBy) return 0;
  if (b >= pointsToWin && b - a >= RULES.winBy) return 1;
  return null;
}

/**
 * Serve alternates every two points; once both players reach deuce (10-10 in an
 * 11-point game) it alternates every point.
 */
export function serverFor(a: number, b: number, firstServer: Side, pointsToWin: number = RULES.pointsToWin): Side {
  const deuce = pointsToWin - 1;
  const total = a + b;
  let switches: number;
  if (a >= deuce && b >= deuce) switches = deuce + (total - 2 * deuce);
  else switches = Math.floor(total / RULES.serveSwitchEvery);
  return switches % 2 === 0 ? firstServer : other(firstServer);
}

export const firstServerOfGame = (m: MatchState): Side => (m.gameNo % 2 === 0 ? m.firstServer : other(m.firstServer));

export function currentServer(m: MatchState): Side {
  return serverFor(m.points[0], m.points[1], firstServerOfGame(m), m.pointsToWin);
}

export interface PointResult {
  gameWinner: Side | null;
  matchWinner: Side | null;
}

/** Award a point. Does not start the next game (call `startNextGame` after the pause). */
export function awardPoint(m: MatchState, winner: Side): PointResult {
  if (m.winner !== null) return { gameWinner: null, matchWinner: m.winner };
  m.points[winner]++;
  const gw = gameWinner(m.points[0], m.points[1], m.pointsToWin);
  if (gw === null) return { gameWinner: null, matchWinner: null };
  m.games[gw]++;
  if (m.games[gw] >= gamesToWin(m)) m.winner = gw;
  return { gameWinner: gw, matchWinner: m.winner };
}

export function startNextGame(m: MatchState): void {
  m.gameNo++;
  m.points = [0, 0];
}

// ───────────────────────────── Rally referee ─────────────────────────────

export type Reason =
  | 'serveFault'
  | 'serveNet'
  | 'out'
  | 'net'
  | 'ownSide'
  | 'doubleBounce'
  | 'missed'
  | 'volley'
  | 'doubleHit'
  | 'stall';

export type Outcome = { kind: 'point'; winner: Side; reason: Reason } | { kind: 'let' };

export type RefEvent =
  | { type: 'table'; side: Side }
  | { type: 'tableSide' }
  | { type: 'net' }
  | { type: 'floor' }
  | { type: 'paddle'; side: Side; z: number }
  | { type: 'stall' };

export interface RallyState {
  server: Side;
  /** serveOwn: waiting for the serve's first bounce (server's half); serveOpp: for the second (receiver's half). */
  stage: 'serveOwn' | 'serveOpp' | 'rally';
  lastHitter: Side;
  /** Bounces on the receiving half since the last hit. */
  bounces: number;
  /** Serve touched the net (for lets). */
  serveNet: boolean;
  /** Ball touched the net since the last hit (only used for the reason shown). */
  netSinceHit: boolean;
}

export function newRally(server: Side): RallyState {
  return { server, stage: 'serveOwn', lastHitter: server, bounces: 0, serveNet: false, netSinceHit: false };
}

const point = (winner: Side, reason: Reason): Outcome => ({ kind: 'point', winner, reason });

/**
 * Apply one ball event to the rally. Returns the outcome when the rally ends
 * (a point or a let), otherwise null. Mutates `r`.
 */
export function referee(r: RallyState, ev: RefEvent): Outcome | null {
  const receiver = other(r.server);
  const H = r.lastHitter;

  if (r.stage !== 'rally') {
    switch (ev.type) {
      case 'net':
        r.serveNet = true;
        r.netSinceHit = true;
        return null;
      case 'table':
        if (r.stage === 'serveOwn') {
          if (ev.side === r.server) {
            r.stage = 'serveOpp';
            return null;
          }
          return point(receiver, 'serveFault');
        }
        if (ev.side === receiver) {
          if (r.serveNet) return { kind: 'let' };
          r.stage = 'rally';
          r.bounces = 1;
          return null;
        }
        return point(receiver, r.serveNet ? 'serveNet' : 'serveFault');
      case 'paddle':
        if (ev.side === r.server) return point(receiver, 'doubleHit');
        // Receiver struck the serve before it bounced on their half.
        if (Math.abs(ev.z) > TABLE.halfL) return point(receiver, 'serveFault');
        return point(r.server, 'volley');
      case 'tableSide':
      case 'floor':
      case 'stall':
        return point(receiver, r.serveNet ? 'serveNet' : 'serveFault');
    }
  }

  switch (ev.type) {
    case 'net':
      r.netSinceHit = true;
      return null;
    case 'paddle': {
      const P = ev.side;
      if (P === H) return point(other(P), 'doubleHit');
      if (r.bounces === 0) {
        // Ball already past the end line: the shot had missed the table.
        if (Math.abs(ev.z) > TABLE.halfL) return point(P, 'out');
        return point(H, 'volley');
      }
      r.lastHitter = P;
      r.bounces = 0;
      r.netSinceHit = false;
      return null;
    }
    case 'table':
      if (r.bounces === 0) {
        if (ev.side === H) return point(other(H), r.netSinceHit ? 'net' : 'ownSide');
        r.bounces = 1;
        return null;
      }
      return point(H, 'doubleBounce');
    case 'tableSide':
    case 'floor':
    case 'stall':
      if (r.bounces === 0) return point(other(H), r.netSinceHit ? 'net' : 'out');
      return point(H, 'missed');
  }
}
