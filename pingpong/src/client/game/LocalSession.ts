import { AiController, aiProfile, type Difficulty } from '../../shared/ai';
import { SIM, type Side } from '../../shared/constants';
import { type GameEvent, GameSim, type PracticeStats } from '../../shared/game';
import { type AssistMode, type PaddleInput, PROFILES } from '../../shared/paddle';
import { Rng } from '../../shared/rng';
import type { RenderView } from '../render/GameRenderer';
import type { NetStatus, ScoreView, Session, SimStats } from './session';

export interface LocalOptions {
  practice: boolean;
  /** Simulator: the computer plays both sides and the user watches. */
  spectate?: boolean;
  /** Difficulty of the side-0 AI in simulator mode. */
  difficulty0?: Difficulty;
  difficulty: Difficulty;
  assist: AssistMode;
  bestOf: 1 | 3;
  names: [string, string];
  styles: [string, string];
}

/**
 * Single-player: the exact same GameSim the server runs, stepped locally at the
 * fixed 240 Hz rate, with the AI on side 1.
 */
export class LocalSession implements Session {
  readonly kind: 'ai' | 'practice' | 'sim';
  readonly mySide: Side = 0;
  names: [string, string];
  styles: [string, string];
  private sim: GameSim;
  private ai: AiController;
  private ai0: AiController | null = null;
  private speed = 1;
  private stats: SimStats = emptySimStats();
  private acc = 0;
  private paused = false;
  private events: GameEvent[] = [];
  private firstServer: Side;

  constructor(opts: LocalOptions) {
    this.kind = opts.spectate ? 'sim' : opts.practice ? 'practice' : 'ai';
    this.names = opts.names;
    this.styles = opts.styles;
    const seed = (Math.random() * 2 ** 31) | 0;
    this.firstServer = opts.practice ? 0 : ((seed & 1) as Side);
    const diff: Difficulty = opts.practice ? 'practice' : opts.difficulty;
    this.sim = new GameSim({
      kind: opts.practice ? 'practice' : 'match',
      bestOf: opts.bestOf,
      firstServer: this.firstServer,
      profiles: [opts.spectate ? aiProfile(opts.difficulty0 ?? 'medium') : PROFILES[opts.practice ? 'arcade' : opts.assist], aiProfile(diff)],
      seed,
      autoServe: [Infinity, Infinity],
      practiceServer: 0,
    });
    this.ai = new AiController(1, diff, new Rng(seed ^ 0x5bd1e995));
    if (opts.spectate) this.ai0 = new AiController(0, opts.difficulty0 ?? 'medium', new Rng(seed ^ 0x27d4eb2f));
  }

  update(dt: number, input: PaddleInput): void {
    if (this.paused) return;
    this.acc += Math.min(dt, 0.1) * this.speed;
    if (!this.ai0) this.sim.setInput(0, input);
    while (this.acc >= SIM.dt) {
      this.acc -= SIM.dt;
      const s = this.sim;
      if (this.ai0) {
        s.setInput(
          0,
          this.ai0.update(
            { phase: s.phase, servingSide: s.servingSide(), hitCount: s.hitCount, lastHitter: s.rally.lastHitter, intercept: s.interceptFor(0), ballX: s.ball.p.x },
            SIM.dt,
          ),
        );
      }
      s.setInput(
        1,
        this.ai.update(
          {
            phase: s.phase,
            servingSide: s.servingSide(),
            hitCount: s.hitCount,
            lastHitter: s.rally.lastHitter,
            intercept: s.interceptFor(1),
            ballX: s.ball.p.x,
          },
          SIM.dt,
        ),
      );
      s.step();
      for (const e of s.drainEvents()) {
        this.events.push(e);
        if (this.ai0) this.track(e);
      }
    }
  }

  myPaddleZ(): number {
    return this.sim.paddles[0].p.z;
  }

  renderView(): RenderView {
    const s = this.sim;
    const pad = (i: Side) => ({ p: s.paddles[i].p, tilt: s.paddles[i].tilt, spin: s.paddles[i].spin, vx: s.paddles[i].v.x });
    return { mySide: 0, ball: s.ball.p, ballVisible: true, pads: [pad(0), pad(1)], styles: this.styles };
  }

  score(): ScoreView {
    const s = this.sim;
    return {
      phase: s.phase,
      phaseTime: s.phaseTime,
      points: [...s.match.points] as [number, number],
      games: [...s.match.games] as [number, number],
      gameNo: s.match.gameNo,
      server: s.servingSide(),
      lastPoint: s.lastPoint,
      winner: s.match.winner,
      bestOf: s.match.bestOf,
    };
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  practiceStats(): PracticeStats | null {
    return this.kind === 'practice' ? this.sim.stats[0] : null;
  }

  private track(e: GameEvent): void {
    const st = this.stats;
    if (e.k === 'hit') {
      st.rally++;
      st.totalHits++;
      st.hits[e.side]++;
      st.lastSpinRpm = (e.spin * 60) / (2 * Math.PI);
      st.longestRally = Math.max(st.longestRally, st.rally);
    } else if (e.k === 'point') {
      st.rallies++;
      st.reasons[e.reason] = (st.reasons[e.reason] ?? 0) + 1;
      st.rally = 0;
    } else if (e.k === 'let') st.rally = 0;
  }

  simStats(): SimStats | null {
    if (!this.ai0) return null;
    const v = this.sim.ball.v;
    const kmh = Math.hypot(v.x, v.y, v.z) * 3.6;
    if (this.sim.phase === 'rally') this.stats.topSpeed = Math.max(this.stats.topSpeed, kmh);
    return { ...this.stats, hits: [...this.stats.hits] as [number, number], reasons: { ...this.stats.reasons }, ballSpeed: this.sim.phase === 'rally' ? kmh : 0, speed: this.speed };
  }

  setSpeed(x: number): void {
    this.speed = Math.max(0, Math.min(4, x));
  }

  net(): NetStatus | null {
    return null;
  }

  setPaused(p: boolean): void {
    this.paused = p;
  }

  rematch(): void {
    this.firstServer = this.firstServer === 0 ? 1 : 0;
    this.sim.restart(this.firstServer);
    this.stats = emptySimStats();
  }

  dispose(): void {}
}

function emptySimStats(): SimStats {
  return { rally: 0, longestRally: 0, rallies: 0, totalHits: 0, hits: [0, 0], ballSpeed: 0, topSpeed: 0, lastSpinRpm: 0, reasons: {}, speed: 1 };
}
