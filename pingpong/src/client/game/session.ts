import type { Side } from '../../shared/constants';
import type { GameEvent, LastPoint, Phase, PracticeStats } from '../../shared/game';
import type { PaddleInput } from '../../shared/paddle';
import type { RenderView } from '../render/GameRenderer';

export interface ScoreView {
  phase: Phase;
  phaseTime: number;
  points: [number, number];
  games: [number, number];
  gameNo: number;
  server: Side;
  lastPoint: LastPoint;
  winner: Side | null;
  bestOf: number;
}

export interface SimStats {
  /** Hits in the rally in progress. */
  rally: number;
  longestRally: number;
  rallies: number;
  totalHits: number;
  hits: [number, number];
  /** Current ball speed, km/h. */
  ballSpeed: number;
  topSpeed: number;
  /** Topspin(+)/backspin(-) of the last stroke, revolutions per minute. */
  lastSpinRpm: number;
  reasons: Record<string, number>;
  speed: number;
}

export interface NetStatus {
  state: 'connecting' | 'open' | 'reconnecting' | 'closed';
  ping: number | null;
  opponentConnected: boolean;
  pausedUntil: number | null;
  rematch: [boolean, boolean];
}

/** A running game, local (vs AI / practice) or online. The UI and renderer only talk to this. */
export interface Session {
  readonly kind: 'ai' | 'practice' | 'online' | 'sim';
  readonly mySide: Side;
  names: [string, string];
  styles: [string, string];
  /** Advance by a real frame time with the local player's intent. */
  update(dt: number, input: PaddleInput): void;
  /** z of the local player's paddle (for projecting the pointer). */
  myPaddleZ(): number;
  renderView(): RenderView;
  score(): ScoreView;
  drainEvents(): GameEvent[];
  practiceStats(): PracticeStats | null;
  /** Live statistics in simulator (AI vs AI) mode. */
  simStats(): SimStats | null;
  /** Simulation speed multiplier (simulator mode only). */
  setSpeed(x: number): void;
  net(): NetStatus | null;
  setPaused(p: boolean): void;
  rematch(): void;
  dispose(): void;
}
