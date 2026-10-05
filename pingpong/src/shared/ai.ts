import { BALL, PADDLE, TABLE, type Side } from './constants';
import { type AssistProfile, type Intercept, type PaddleInput, READY_Y, neutralInput } from './paddle';
import type { Rng } from './rng';
import { clamp } from './vec';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'practice';

interface AiTuning {
  /** Seconds before reacting to a new incoming ball (randomised ±25%). */
  reaction: number;
  /** Paddle speed limit (m/s). */
  speed: number;
  /** Std-dev of positional misjudgement (m). */
  posError: number;
  /** Chance of a bad read that makes a whiff likely. */
  blunder: number;
  /** Probability of a power shot on a comfortable ball. */
  aggression: number;
  /** Probability of using topspin / backspin. */
  topspin: number;
  backspin: number;
  /** How far off-centre it deliberately contacts to angle shots (m). */
  angle: number;
  /** Shot assist and execution noise. */
  shot: number;
  noise: number;
}

const TUNING: Record<Difficulty, AiTuning> = {
  practice: { reaction: 0.3, speed: 2.6, posError: 0.02, blunder: 0, aggression: 0, topspin: 0.1, backspin: 0.05, angle: 0, shot: 0.95, noise: 0.02 },
  easy: { reaction: 0.4, speed: 2.5, posError: 0.07, blunder: 0.07, aggression: 0.05, topspin: 0.2, backspin: 0.15, angle: 0.012, shot: 0.6, noise: 0.075 },
  medium: { reaction: 0.28, speed: 3.0, posError: 0.05, blunder: 0.05, aggression: 0.18, topspin: 0.45, backspin: 0.2, angle: 0.025, shot: 0.68, noise: 0.055 },
  hard: { reaction: 0.19, speed: 4.2, posError: 0.034, blunder: 0.03, aggression: 0.55, topspin: 0.65, backspin: 0.2, angle: 0.045, shot: 0.76, noise: 0.05 },
};

export function aiProfile(d: Difficulty): AssistProfile {
  const t = TUNING[d];
  return {
    shot: t.shot,
    serve: 1,
    height: 0,
    lateral: 0,
    hitRadius: 0.078 + BALL.radius + 0.03,
    maxSpeed: t.speed,
    footwork: t.speed * 1.3,
    shotNoise: t.noise,
    onlyAfterBounce: true,
  };
}

export interface AiView {
  phase: string;
  servingSide: Side;
  /** Changes each time anyone hits the ball (new incoming ball). */
  hitCount: number;
  lastHitter: Side;
  intercept: Intercept | null;
  ballX: number;
}

/**
 * Computer opponent. It perceives the ball through the same trajectory predictor as
 * the assist, but with a reaction delay, a speed-limited paddle, a misjudgement on
 * every ball and occasional blunders — so it is beatable at every level.
 */
export class AiController {
  readonly tuning: AiTuning;
  private input: PaddleInput = neutralInput();
  private seenHit = -1;
  private reactAt = 0;
  private errX = 0;
  private errY = 0;
  private aimOffset = 0;
  private serveAt = -1;
  private time = 0;
  private powerRoll = 1;

  constructor(
    readonly side: Side,
    readonly difficulty: Difficulty,
    private rng: Rng,
  ) {
    this.tuning = TUNING[difficulty];
  }

  update(view: AiView, dt: number): PaddleInput {
    this.time += dt;
    const t = this.tuning;
    const inp = this.input;

    if (view.phase === 'serve') {
      if (view.servingSide === this.side) {
        if (this.serveAt < 0) {
          this.serveAt = this.time + this.rng.range(0.7, 1.5);
          inp.x = this.rng.range(-0.45, 0.45);
          inp.y = READY_Y;
          inp.tilt = this.rng.range(-0.6, 0.7);
          inp.spin = this.rng.chance(t.backspin * 1.5) ? -1 : this.rng.chance(t.topspin * 0.6) ? 1 : 0;
          inp.power = this.rng.chance(t.aggression * 0.5);
        }
        if (this.time >= this.serveAt) {
          inp.act = (inp.act + 1) & 0xffff;
          this.serveAt = Number.POSITIVE_INFINITY;
        }
      } else {
        this.goReady(dt);
      }
      return { ...inp };
    }
    this.serveAt = -1;

    if (view.phase !== 'rally') {
      this.goReady(dt);
      return { ...inp };
    }

    if (view.hitCount !== this.seenHit) {
      // A new ball is coming (or ours just left): re-plan.
      this.seenHit = view.hitCount;
      this.reactAt = this.time + t.reaction * this.rng.range(0.75, 1.25);
      const blunder = this.rng.chance(t.blunder);
      this.errX = this.rng.gauss(t.posError) + (blunder ? this.rng.range(-1, 1) * 0.16 : 0);
      this.errY = this.rng.gauss(t.posError * 0.8) + (blunder ? this.rng.range(-1, 1) * 0.1 : 0);
      this.aimOffset = this.rng.range(-1, 1) * t.angle;
      inp.spin = this.rng.chance(t.topspin) ? 1 : this.rng.chance(t.backspin) ? -1 : 0;
      inp.tilt = this.rng.range(-0.25, 0.35);
      this.powerRoll = this.rng.next();
    }

    if (view.lastHitter === this.side || !view.intercept) {
      this.goReady(dt);
      return { ...inp };
    }
    if (this.time < this.reactAt) return { ...inp };

    const ic = view.intercept;
    inp.x = clamp(ic.x + this.errX + this.aimOffset, PADDLE.minX, PADDLE.maxX);
    inp.y = clamp(ic.y + this.errY, PADDLE.minY, PADDLE.maxY);
    const high = ic.y > TABLE.height + 0.32;
    // Attack comfortable high balls more often.
    inp.power = this.powerRoll < t.aggression * (high ? 1.4 : 0.6);
    // A ball that sits low needs an open face; a high ball can be driven flatter.
    if (ic.y < TABLE.height + 0.12) inp.tilt = Math.max(inp.tilt, 0.25);
    else if (high && inp.power) inp.tilt = -0.35;
    return { ...inp };
  }

  private goReady(dt: number): void {
    const k = Math.min(1, dt * 2);
    this.input.x += (0 - this.input.x) * k;
    this.input.y += (READY_Y - this.input.y) * k;
  }
}
