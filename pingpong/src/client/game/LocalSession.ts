import { AiController, aiProfile, type Difficulty } from '../../shared/ai';
import { SIM, type Side } from '../../shared/constants';
import { type GameEvent, GameSim, type PracticeStats } from '../../shared/game';
import { type AssistMode, type PaddleInput, PROFILES } from '../../shared/paddle';
import { Rng } from '../../shared/rng';
import type { RenderView } from '../render/GameRenderer';
import type { NetStatus, ScoreView, Session } from './session';

export interface LocalOptions {
  practice: boolean;
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
  readonly kind: 'ai' | 'practice';
  readonly mySide: Side = 0;
  names: [string, string];
  styles: [string, string];
  private sim: GameSim;
  private ai: AiController;
  private acc = 0;
  private paused = false;
  private events: GameEvent[] = [];
  private firstServer: Side;

  constructor(opts: LocalOptions) {
    this.kind = opts.practice ? 'practice' : 'ai';
    this.names = opts.names;
    this.styles = opts.styles;
    const seed = (Math.random() * 2 ** 31) | 0;
    this.firstServer = opts.practice ? 0 : ((seed & 1) as Side);
    const diff: Difficulty = opts.practice ? 'practice' : opts.difficulty;
    this.sim = new GameSim({
      kind: opts.practice ? 'practice' : 'match',
      bestOf: opts.bestOf,
      firstServer: this.firstServer,
      profiles: [PROFILES[opts.practice ? 'arcade' : opts.assist], aiProfile(diff)],
      seed,
      autoServe: [Infinity, Infinity],
      practiceServer: 0,
    });
    this.ai = new AiController(1, diff, new Rng(seed ^ 0x5bd1e995));
  }

  update(dt: number, input: PaddleInput): void {
    if (this.paused) return;
    this.acc += Math.min(dt, 0.1);
    this.sim.setInput(0, input);
    while (this.acc >= SIM.dt) {
      this.acc -= SIM.dt;
      const s = this.sim;
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
      for (const e of s.drainEvents()) this.events.push(e);
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

  net(): NetStatus | null {
    return null;
  }

  setPaused(p: boolean): void {
    this.paused = p;
  }

  rematch(): void {
    this.firstServer = this.firstServer === 0 ? 1 : 0;
    this.sim.restart(this.firstServer);
  }

  dispose(): void {}
}
