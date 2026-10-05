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

export interface NetStatus {
  state: 'connecting' | 'open' | 'reconnecting' | 'closed';
  ping: number | null;
  opponentConnected: boolean;
  pausedUntil: number | null;
  rematch: [boolean, boolean];
}

/** A running game, local (vs AI / practice) or online. The UI and renderer only talk to this. */
export interface Session {
  readonly kind: 'ai' | 'practice' | 'online';
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
  net(): NetStatus | null;
  setPaused(p: boolean): void;
  rematch(): void;
  dispose(): void;
}
