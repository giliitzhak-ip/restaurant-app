/**
 * MatchState is the authoritative, fully serializable snapshot of a match.
 * It must never hold a reference to Babylon.js, the DOM or any engine object:
 * an authoritative server has to be able to own this exact structure.
 */
import { GameConfig, type ScoreKind } from '../config/GameConfig';
import { vec3, type Vec3 } from '../core/math';

export type TeamId = 'home' | 'away';
export type MatchPhase = 'idle' | 'kickoff' | 'playing' | 'celebration' | 'finished';
export type MatchOutcome = 'homeWin' | 'awayWin' | 'draw';

export interface PlayerState {
  readonly id: string;
  readonly team: TeamId;
  /**
   * Whether a person is driving this player right now. The session owns this:
   * the same slot can be a human in one match and the AI in the next.
   */
  isHuman: boolean;
  /** Display name. Editable by the player, never sent anywhere. */
  name: string;
  /** Index into the team colour palette. */
  colorId: number;
  position: Vec3;
  velocity: Vec3;
  /** Body yaw in radians, 0 = facing +Z. */
  facing: number;
  stamina: number;
  /** 0..1 while a kick is being charged, 0 when idle. */
  kickCharge: number;
  charging: boolean;
  lofted: boolean;
  sprinting: boolean;
  kickCooldown: number;
  tackleCooldown: number;
  stunTimer: number;
  /**
   * 0..1 strength of the shot-direction assist for this player. Set by the
   * session from the controller kind and the player's settings; the simulation
   * only ever reads the number, never the device behind it.
   */
  aimAssist: number;
  /** Counts down the wind-up between releasing the shot and the foot connecting. */
  windUpTimer: number;
}

export interface BallState {
  position: Vec3;
  velocity: Vec3;
  lastTouchBy: string | null;
  lastTouchTeam: TeamId | null;
  lastTouchTick: number;
}

/** Everything known about one shot, recorded when the ball is struck. */
export interface ShotRecord {
  shotId: string;
  playerId: string;
  teamId: TeamId;
  /** Tick the ball was struck on. */
  originatingTick: number;
  shotType: ShotType;
  /** Charge at the moment of release, 0..1. */
  power: number;
}

export type ShotType = 'flat' | 'lob';

export interface ScoreEventRecord {
  shotId: string;
  kind: ScoreKind;
  /** Team credited with the points. */
  team: TeamId;
  /** Player credited with the points, or null for an unattributed rolling ball. */
  playerId: string | null;
  points: number;
  tick: number;
  /** True when the ball went into the scorer's own net. */
  ownGoal: boolean;
  shotType: ShotType;
  power: number;
}

export interface MatchState {
  tick: number;
  /** Seconds of simulated time since the match started. */
  elapsed: number;
  phase: MatchPhase;
  /** Countdown for the current transient phase (kickoff / celebration). */
  phaseTimer: number;
  timeRemaining: number;
  score: Record<TeamId, number>;
  players: PlayerState[];
  ball: BallState;
  lastEvent: ScoreEventRecord | null;
  /** Team that kicks off next; set after a scoring event. */
  kickoffTeam: TeamId;
}

export function createPlayerState(
  id: string,
  team: TeamId,
  isHuman: boolean,
  position: Vec3,
  facing: number,
  name = id,
  colorId = team === 'home' ? 0 : 1,
): PlayerState {
  return {
    id,
    team,
    isHuman,
    name,
    colorId,
    position: { ...position },
    velocity: vec3(),
    facing,
    stamina: GameConfig.player.staminaMax,
    kickCharge: 0,
    charging: false,
    lofted: false,
    sprinting: false,
    kickCooldown: 0,
    tackleCooldown: 0,
    stunTimer: 0,
    aimAssist: 0,
    windUpTimer: 0,
  };
}

/** The goal a team attacks. Home attacks +Z, away attacks -Z. */
export function attackingGoalZ(team: TeamId): number {
  return team === 'home' ? GameConfig.field.length / 2 : -GameConfig.field.length / 2;
}

/** The goal a team defends. */
export function defendingGoalZ(team: TeamId): number {
  return -attackingGoalZ(team);
}

export function opponentOf(team: TeamId): TeamId {
  return team === 'home' ? 'away' : 'home';
}

/** Which team owns (defends) the goal sitting at the given Z side. */
export function goalOwnerAtZ(z: number): TeamId {
  return z < 0 ? 'home' : 'away';
}

export function createMatchState(): MatchState {
  const halfLength = GameConfig.field.length / 2;
  return {
    tick: 0,
    elapsed: 0,
    phase: 'idle',
    phaseTimer: 0,
    timeRemaining: GameConfig.match.durationSeconds,
    score: { home: 0, away: 0 },
    players: [
      createPlayerState('home-1', 'home', true, vec3(0, 0, -halfLength * 0.42), 0, 'שחקן 1', 0),
      createPlayerState('away-1', 'away', false, vec3(0, 0, halfLength * 0.42), Math.PI, 'מחשב', 1),
    ],
    ball: {
      position: vec3(0, GameConfig.ball.radius, 0),
      velocity: vec3(),
      lastTouchBy: null,
      lastTouchTeam: null,
      lastTouchTick: 0,
    },
    lastEvent: null,
    kickoffTeam: 'home',
  };
}

export function findPlayer(state: MatchState, id: string): PlayerState | undefined {
  return state.players.find((player) => player.id === id);
}

/** Deep structural copy. Used for snapshots and, later, for network deltas. */
export function cloneMatchState(state: MatchState): MatchState {
  return JSON.parse(JSON.stringify(state)) as MatchState;
}

export function matchOutcome(state: MatchState): MatchOutcome {
  if (state.score.home > state.score.away) return 'homeWin';
  if (state.score.away > state.score.home) return 'awayWin';
  return 'draw';
}
