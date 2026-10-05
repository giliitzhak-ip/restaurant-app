import { SIM, TABLE, TIMING, dirOut, type Side } from './constants';
import {
  type AssistProfile,
  type Intercept,
  type PaddleInput,
  type PaddleState,
  READY_Y,
  findIntercept,
  homeZ,
  neutralInput,
  newPaddle,
  updatePaddle,
} from './paddle';
import { type BallState, type PhysEvent, restingBall, stepBall, sweepPaddle } from './physics';
import { Rng } from './rng';
import {
  type MatchState,
  type Outcome,
  type RallyState,
  type Reason,
  type RefEvent,
  awardPoint,
  currentServer,
  newMatch,
  newRally,
  referee,
  startNextGame,
} from './rules';
import { computeServe, computeShot, topspinOf } from './shot';
import { type V3, clone, len, lerp, v3 } from './vec';

/** Max |x| of the server's paddle while serving. */
export const SERVE_HALF_WIDTH = 0.6;

export type Phase = 'countdown' | 'serve' | 'rally' | 'point' | 'gameOver' | 'matchOver';

export type GameEvent =
  | { k: 'hit'; side: Side; speed: number; spin: number; power: number; serve: boolean }
  | { k: 'table'; side: Side; speed: number; x: number; z: number }
  | { k: 'net'; speed: number; cord: boolean }
  | { k: 'floor'; speed: number }
  | { k: 'tableSide'; speed: number }
  | { k: 'point'; winner: Side; reason: Reason }
  | { k: 'let' }
  | { k: 'game'; winner: Side }
  | { k: 'match'; winner: Side }
  | { k: 'phase'; phase: Phase };

export interface GameConfig {
  kind: 'match' | 'practice';
  bestOf: 1 | 3 | 5;
  pointsToWin: number;
  firstServer: Side;
  profiles: [AssistProfile, AssistProfile];
  seed: number;
  /** Seconds a side may hold the serve before it is served automatically. */
  autoServe: [number, number];
  /** In practice mode this side always serves. */
  practiceServer: Side;
}

export interface PracticeStats {
  hits: number;
  topspin: number;
  backspin: number;
  power: number;
  goodServes: number;
  returns: number;
}

export type LastPoint = { winner: Side; reason: Reason } | { let: true } | null;

/** Compact, JSON-friendly state used for network snapshots and rendering. */
export interface Snapshot {
  tick: number;
  phase: Phase;
  phaseTime: number;
  /** px,py,pz, vx,vy,vz, wx,wy,wz */
  ball: number[];
  /** Per side: x,y,z, tilt, spin, vx, vy */
  pads: [number[], number[]];
  points: [number, number];
  games: [number, number];
  gameNo: number;
  server: Side;
  lastPoint: LastPoint;
  winner: Side | null;
  bestOf: number;
  /** Last processed input sequence per side (filled in by the server). */
  ack?: [number, number];
}

export class GameSim {
  readonly cfg: GameConfig;
  ball: BallState = restingBall();
  paddles: [PaddleState, PaddleState] = [newPaddle(0), newPaddle(1)];
  inputs: [PaddleInput, PaddleInput] = [neutralInput(), neutralInput()];
  match: MatchState;
  rally: RallyState;
  phase: Phase = 'countdown';
  phaseTime = 0;
  tick = 0;
  /** Events since the last drain. */
  events: GameEvent[] = [];
  lastPoint: LastPoint = null;
  paused = false;
  hitCount = 0;
  stats: [PracticeStats, PracticeStats] = [emptyStats(), emptyStats()];
  readonly rng: Rng;

  private lastAct: [number, number] = [0, 0];
  private intercepts: [Intercept | null, Intercept | null] = [null, null];
  private interceptEpoch = -1;
  private ballEpoch = 0;
  private cooldown: [number, number] = [0, 0];
  private sinceBallEvent = 0;
  private pendingGameWinner: Side | null = null;
  private physEvents: PhysEvent[] = [];

  constructor(cfg: Partial<GameConfig> & { profiles: [AssistProfile, AssistProfile] }) {
    this.cfg = {
      kind: 'match',
      bestOf: 1,
      pointsToWin: 11,
      firstServer: 0,
      seed: 1,
      autoServe: [Infinity, Infinity],
      practiceServer: 0,
      ...cfg,
    };
    this.rng = new Rng(this.cfg.seed);
    this.match = newMatch(this.cfg.bestOf, this.cfg.firstServer, this.cfg.pointsToWin);
    this.rally = newRally(this.servingSide());
    this.holdBallForServe();
  }

  servingSide(): Side {
    return this.cfg.kind === 'practice' ? this.cfg.practiceServer : currentServer(this.match);
  }

  setInput(side: Side, input: PaddleInput): void {
    this.inputs[side] = input;
  }

  interceptFor(side: Side): Intercept | null {
    return this.intercepts[side];
  }

  /** Run whole physics steps covering `seconds` (used by tests and offline play). */
  advance(seconds: number): void {
    const n = Math.round(seconds / SIM.dt);
    for (let i = 0; i < n; i++) this.step();
  }

  /** Advance one fixed physics step (SIM.dt). */
  step(): void {
    if (this.paused) return;
    const dt = SIM.dt;
    this.tick++;
    this.phaseTime += dt;
    this.cooldown[0] = Math.max(0, this.cooldown[0] - dt);
    this.cooldown[1] = Math.max(0, this.cooldown[1] - dt);

    switch (this.phase) {
      case 'countdown':
        this.updatePaddles(dt, true);
        this.holdBallForServe();
        if (this.phaseTime >= TIMING.countdown) this.enterServe();
        return;
      case 'serve': {
        const s = this.servingSide();
        this.updatePaddles(dt, true);
        this.holdBallForServe();
        const pressed = this.inputs[s].act !== this.lastAct[s];
        if (this.phaseTime >= TIMING.serveMinHold && (pressed || this.phaseTime >= this.cfg.autoServe[s])) {
          this.serve(s);
        }
        return;
      }
      case 'rally':
        this.rallyStep(dt);
        return;
      case 'point':
        this.freeStep(dt);
        if (this.phaseTime >= TIMING.pointPause) this.afterPoint();
        return;
      case 'gameOver':
        this.freeStep(dt);
        if (this.phaseTime >= TIMING.gamePause) {
          startNextGame(this.match);
          this.setPhase('countdown');
          this.rally = newRally(this.servingSide());
          this.holdBallForServe();
        }
        return;
      case 'matchOver':
        this.freeStep(dt);
        return;
    }
  }

  /** Restart the match with the same configuration (rematch). */
  restart(firstServer: Side = this.cfg.firstServer): void {
    this.match = newMatch(this.cfg.bestOf, firstServer, this.cfg.pointsToWin);
    this.lastPoint = null;
    this.stats = [emptyStats(), emptyStats()];
    this.rally = newRally(this.servingSide());
    this.setPhase('countdown');
    this.holdBallForServe();
  }

  /** Abandon the current rally without scoring and serve again (used after a reconnect). */
  replayPoint(): void {
    if (this.phase === 'rally' || this.phase === 'serve') {
      this.lastPoint = null;
      this.enterServe();
    }
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  snapshot(): Snapshot {
    const b = this.ball;
    const pad = (p: PaddleState) => [p.p.x, p.p.y, p.p.z, p.tilt, p.spin, p.v.x, p.v.y].map(r4);
    return {
      tick: this.tick,
      phase: this.phase,
      phaseTime: r4(this.phaseTime),
      ball: [b.p.x, b.p.y, b.p.z, b.v.x, b.v.y, b.v.z, b.w.x, b.w.y, b.w.z].map(r4),
      pads: [pad(this.paddles[0]), pad(this.paddles[1])],
      points: [this.match.points[0], this.match.points[1]],
      games: [this.match.games[0], this.match.games[1]],
      gameNo: this.match.gameNo,
      server: this.servingSide(),
      lastPoint: this.lastPoint,
      winner: this.match.winner,
      bestOf: this.match.bestOf,
    };
  }

  // ─────────────────────────── internals ───────────────────────────

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseTime = 0;
    this.events.push({ k: 'phase', phase: p });
  }

  private enterServe(): void {
    const s = this.servingSide();
    this.rally = newRally(s);
    this.lastAct = [this.inputs[0].act, this.inputs[1].act];
    this.setPhase('serve');
    this.holdBallForServe();
  }

  private holdBallForServe(): void {
    const s = this.servingSide();
    this.ball.p = heldBallPosition(this.paddles[s].p, s, this.phaseTime);
    this.ball.v = v3();
    this.ball.w = v3();
  }

  private serve(s: Side): void {
    const shot = computeServe(this.ball.p, s, this.paddles[s], this.inputs[s], this.cfg.profiles[s], this.rng);
    this.ball.v = shot.v;
    this.ball.w = shot.w;
    this.rally = newRally(s);
    this.cooldown[s] = 0.25;
    this.hitCount++;
    this.ballEpoch++;
    this.sinceBallEvent = 0;
    this.events.push({ k: 'hit', side: s, speed: len(shot.v), spin: topspinOf(shot.v, shot.w), power: shot.power, serve: true });
    this.setPhase('rally');
  }

  private updatePaddles(dt: number, serving: boolean): void {
    if (!serving && this.interceptEpoch !== this.ballEpoch) {
      this.interceptEpoch = this.ballEpoch;
      const r = this.rally;
      const bounced = (s: Side) => r.stage === 'rally' && r.lastHitter !== s && r.bounces >= 1;
      this.intercepts = [findIntercept(this.ball, 0, bounced(0)), findIntercept(this.ball, 1, bounced(1))];
    }
    if (serving) this.intercepts = [null, null];
    const server = this.servingSide();
    for (const s of [0, 1] as const) {
      // Decrease intercept time as we approach it.
      const ic = this.intercepts[s];
      if (ic) ic.t = Math.max(0, ic.t - dt);
      const servingZ = serving ? homeZ(s) + (s === server ? dirOut(s) * 0.05 : 0) : undefined;
      // The server must toss from behind the end line, within the table's width.
      const inp = serving && s === server ? { ...this.inputs[s], x: Math.max(-SERVE_HALF_WIDTH, Math.min(SERVE_HALF_WIDTH, this.inputs[s].x)) } : this.inputs[s];
      updatePaddle(this.paddles[s], inp, ic, this.cfg.profiles[s], s, dt, servingZ);
    }
  }

  private freeStep(dt: number): void {
    // After a point the ball keeps flying for show; paddles drift back to ready.
    for (const s of [0, 1] as const) {
      const inp = { ...this.inputs[s], y: Math.max(this.inputs[s].y, READY_Y - 0.1) };
      updatePaddle(this.paddles[s], inp, null, this.cfg.profiles[s], s, dt);
    }
    this.physEvents.length = 0;
    stepBall(this.ball, dt, this.physEvents);
    for (const e of this.physEvents) this.pushPhysEvent(e);
  }

  private rallyStep(dt: number): void {
    const b0 = clone(this.ball.p);
    const pads0 = [clone(this.paddles[0].p), clone(this.paddles[1].p)];
    this.updatePaddles(dt, false);

    this.physEvents.length = 0;
    stepBall(this.ball, dt, this.physEvents);
    this.sinceBallEvent += dt;
    for (const e of this.physEvents) {
      this.ballEpoch++;
      this.sinceBallEvent = 0;
      this.pushPhysEvent(e);
      const ref: RefEvent = e.type === 'table' ? { type: 'table', side: e.side } : { type: e.type };
      if (this.applyOutcome(referee(this.rally, ref))) return;
    }

    // Paddle contact (swept against both the ball's and the paddle's motion).
    for (const s of [0, 1] as const) {
      if (this.cooldown[s] > 0 || !this.canHit(s)) continue;
      const t = sweepPaddle(b0, this.ball.p, pads0[s], this.paddles[s].p, s, this.cfg.profiles[s].hitRadius);
      if (t === null) continue;
      this.hit(s, lerp(b0, this.ball.p, t));
      return;
    }

    const p = this.ball.p;
    const lost = Math.abs(p.z) > 9 || Math.abs(p.x) > 7 || p.y < -1;
    if (lost || this.sinceBallEvent > TIMING.rallyStall) {
      this.applyOutcome(referee(this.rally, lost ? { type: 'floor' } : { type: 'stall' }));
    }
  }

  private canHit(s: Side): boolean {
    const dir = dirOut(s);
    if (this.ball.v.z * dir >= 0) return false; // ball moving away from this side
    const r = this.rally;
    if (r.stage !== 'rally') {
      // Serve in flight: the receiver may only touch it after it is legally on their side.
      if (s === r.server) return false;
      return !this.cfg.profiles[s].onlyAfterBounce;
    }
    if (r.lastHitter === s) return false;
    if (this.cfg.profiles[s].onlyAfterBounce) {
      return r.bounces >= 1 || Math.abs(this.ball.p.z) > TABLE.halfL + 0.05;
    }
    return true;
  }

  private hit(s: Side, contact: { x: number; y: number; z: number }): void {
    const pad = this.paddles[s];
    this.ball.p = { x: contact.x, y: contact.y, z: pad.p.z + dirOut(s) * 0.021 };
    const outcome = referee(this.rally, { type: 'paddle', side: s, z: contact.z });
    const shot = computeShot(this.ball, s, pad, this.inputs[s], this.cfg.profiles[s], this.rng);
    this.ball.v = shot.v;
    this.ball.w = shot.w;
    this.cooldown[s] = 0.25;
    this.hitCount++;
    this.ballEpoch++;
    this.sinceBallEvent = 0;
    const spin = topspinOf(shot.v, shot.w);
    this.events.push({ k: 'hit', side: s, speed: len(shot.v), spin, power: shot.power, serve: false });
    const st = this.stats[s];
    st.hits++;
    if (this.inputs[s].spin > 0) st.topspin++;
    if (this.inputs[s].spin < 0) st.backspin++;
    if (shot.power > 0.75) st.power++;
    this.applyOutcome(outcome);
  }

  private pushPhysEvent(e: PhysEvent): void {
    switch (e.type) {
      case 'table':
        this.events.push({ k: 'table', side: e.side, speed: e.speed, x: e.x, z: e.z });
        // Practice tracking: a legal serve / a return that landed.
        if (this.phase === 'rally') {
          const r = this.rally;
          if (r.stage === 'serveOpp' && e.side !== r.server) this.stats[r.server].goodServes++;
          else if (r.stage === 'rally' && r.bounces === 0 && e.side !== r.lastHitter) this.stats[r.lastHitter].returns++;
        }
        return;
      case 'net':
        this.events.push({ k: 'net', speed: e.speed, cord: e.cord });
        return;
      case 'floor':
        this.events.push({ k: 'floor', speed: e.speed });
        return;
      case 'tableSide':
        this.events.push({ k: 'tableSide', speed: e.speed });
        return;
    }
  }

  /** Returns true when the rally ended. */
  private applyOutcome(o: Outcome | null): boolean {
    if (!o || this.phase !== 'rally') return false;
    if (o.kind === 'let') {
      this.lastPoint = { let: true };
      this.events.push({ k: 'let' });
      this.setPhase('point');
      return true;
    }
    this.lastPoint = { winner: o.winner, reason: o.reason };
    this.events.push({ k: 'point', winner: o.winner, reason: o.reason });
    if (this.cfg.kind === 'match') {
      const res = awardPoint(this.match, o.winner);
      this.pendingGameWinner = res.gameWinner;
      if (res.gameWinner !== null) this.events.push({ k: 'game', winner: res.gameWinner });
      if (res.matchWinner !== null) this.events.push({ k: 'match', winner: res.matchWinner });
    }
    this.setPhase('point');
    return true;
  }

  private afterPoint(): void {
    if (this.match.winner !== null) {
      this.setPhase('matchOver');
      return;
    }
    if (this.pendingGameWinner !== null) {
      this.pendingGameWinner = null;
      this.setPhase('gameOver');
      return;
    }
    this.enterServe();
  }
}

/** Where the server holds (tosses) the ball before serving. Shared with the client for prediction. */
export function heldBallPosition(pad: V3, s: Side, phaseTime: number): V3 {
  const bob = Math.sin(phaseTime * 3.2) * 0.035;
  return v3(pad.x + 0.03 * -dirOut(s), TABLE.height + 0.34 + bob, pad.z + dirOut(s) * 0.13);
}

function emptyStats(): PracticeStats {
  return { hits: 0, topspin: 0, backspin: 0, power: 0, goodServes: 0, returns: 0 };
}

const r4 = (n: number): number => Math.round(n * 10000) / 10000;

