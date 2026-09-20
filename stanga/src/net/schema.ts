/**
 * The Colyseus state schema: the only thing the server sends on every tick.
 *
 * It is a projection of `MatchState`, not a copy of the simulation. Meshes,
 * animation frames and physics bodies are never synchronised — the client
 * rebuilds all of that locally from these numbers.
 *
 * Fields are declared with `declare` and registered through `defineTypes`
 * rather than decorators: `useDefineForClassFields` would otherwise install own
 * data properties over the accessors Colyseus needs for change tracking.
 */
import { MapSchema, Schema, defineTypes } from '@colyseus/schema';

/**
 * One player, keyed in `MatchRoomState.players` by `playerId` — the seat, not
 * the connection. A seat outlives a dropped socket, which is exactly what the
 * reconnection grace period needs. Session ids are never published: they are
 * the server's business, and a client has no use for another player's.
 */
export class NetPlayer extends Schema {
  /** Simulation identity, e.g. `home-1`. Assigned by the server only. */
  declare playerId: string;
  declare team: string;
  declare name: string;
  declare colorId: number;
  /** False while the player is inside the reconnection grace period. */
  declare connected: boolean;
  declare ready: boolean;
  declare rematchVote: boolean;
  /** Last input sequence number the server consumed; drives reconciliation. */
  declare lastInput: number;

  declare x: number;
  declare y: number;
  declare z: number;
  declare vx: number;
  declare vy: number;
  declare vz: number;
  declare facing: number;

  declare stamina: number;
  declare kickCharge: number;
  declare charging: boolean;
  declare lofted: boolean;
  declare sprinting: boolean;
  declare stunTimer: number;

  constructor() {
    super();
    this.playerId = '';
    this.team = 'home';
    this.name = '';
    this.colorId = 0;
    this.connected = true;
    this.ready = false;
    this.rematchVote = false;
    this.lastInput = 0;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.facing = 0;
    this.stamina = 0;
    this.kickCharge = 0;
    this.charging = false;
    this.lofted = false;
    this.sprinting = false;
    this.stunTimer = 0;
  }
}

defineTypes(NetPlayer, {
  playerId: 'string',
  team: 'string',
  name: 'string',
  colorId: 'uint8',
  connected: 'boolean',
  ready: 'boolean',
  rematchVote: 'boolean',
  lastInput: 'uint32',
  x: 'float32',
  y: 'float32',
  z: 'float32',
  vx: 'float32',
  vy: 'float32',
  vz: 'float32',
  facing: 'float32',
  stamina: 'float32',
  kickCharge: 'float32',
  charging: 'boolean',
  lofted: 'boolean',
  sprinting: 'boolean',
  stunTimer: 'float32',
});

export class NetBall extends Schema {
  declare x: number;
  declare y: number;
  declare z: number;
  declare vx: number;
  declare vy: number;
  declare vz: number;
  declare lastTouchBy: string;
  declare lastTouchTeam: string;

  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.lastTouchBy = '';
    this.lastTouchTeam = '';
  }
}

defineTypes(NetBall, {
  x: 'float32',
  y: 'float32',
  z: 'float32',
  vx: 'float32',
  vy: 'float32',
  vz: 'float32',
  lastTouchBy: 'string',
  lastTouchTeam: 'string',
});

/** The last scoring event, so a rejoining client can render the banner. */
export class NetScore extends Schema {
  declare kind: string;
  declare team: string;
  declare playerId: string;
  declare points: number;
  declare ownGoal: boolean;
  declare tick: number;

  constructor() {
    super();
    this.kind = '';
    this.team = '';
    this.playerId = '';
    this.points = 0;
    this.ownGoal = false;
    this.tick = 0;
  }
}

defineTypes(NetScore, {
  kind: 'string',
  team: 'string',
  playerId: 'string',
  points: 'uint8',
  ownGoal: 'boolean',
  tick: 'uint32',
});

/**
 * Room lifecycle, deliberately separate from `MatchPhase`: a room can be
 * waiting for an opponent long before the simulation has a phase at all.
 */
export type RoomStage =
  'waiting' | 'lobby' | 'countdown' | 'playing' | 'paused' | 'finished' | 'closed';

export class MatchRoomState extends Schema {
  declare stage: string;
  declare mode: string;
  /** Empty for a matchmade room. */
  declare inviteCode: string;
  declare isPrivate: boolean;
  /** Seconds left in whatever the room is counting down. */
  declare stageTimer: number;

  /** Mirrors of MatchState, for rendering and the HUD. */
  declare phase: string;
  declare tick: number;
  declare elapsed: number;
  declare timeRemaining: number;
  declare scoreHome: number;
  declare scoreAway: number;
  declare kickoffTeam: string;

  declare players: MapSchema<NetPlayer>;
  declare ball: NetBall;
  declare lastScore: NetScore;

  constructor() {
    super();
    this.stage = 'waiting';
    this.mode = 'oneVsOne';
    this.inviteCode = '';
    this.isPrivate = false;
    this.stageTimer = 0;
    this.phase = 'idle';
    this.tick = 0;
    this.elapsed = 0;
    this.timeRemaining = 0;
    this.scoreHome = 0;
    this.scoreAway = 0;
    this.kickoffTeam = 'home';
    this.players = new MapSchema<NetPlayer>();
    this.ball = new NetBall();
    this.lastScore = new NetScore();
  }
}

defineTypes(MatchRoomState, {
  stage: 'string',
  mode: 'string',
  inviteCode: 'string',
  isPrivate: 'boolean',
  stageTimer: 'float32',
  phase: 'string',
  tick: 'uint32',
  elapsed: 'float32',
  timeRemaining: 'float32',
  scoreHome: 'uint16',
  scoreAway: 'uint16',
  kickoffTeam: 'string',
  players: { map: NetPlayer },
  ball: NetBall,
  lastScore: NetScore,
});
