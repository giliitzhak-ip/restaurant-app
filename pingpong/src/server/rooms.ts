import { randomBytes, randomInt } from 'node:crypto';
import type { WebSocket } from 'ws';
import { SIM } from '../shared/constants';
import { GameSim, type GameEvent } from '../shared/game';
import { PROFILES, type PaddleInput } from '../shared/paddle';
import {
  type ClientMsg,
  type ErrorCode,
  type PaddleStyle,
  type PlayerInfo,
  PROTOCOL_VERSION,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type RoomPhase,
  type RoomSettings,
  type ServerMsg,
} from '../shared/protocol';

export const LIMITS = {
  /** How long a disconnected player's seat is kept (game paused meanwhile). */
  reconnectGraceMs: 60_000,
  /** Lobby rooms with nobody doing anything are closed after this. */
  idleLobbyMs: 30 * 60_000,
  /** Seconds a player may hold serve before it is played automatically. */
  autoServeSeconds: 10,
  /** Max queued inputs per player before old ones are dropped (prevents lag build-up). */
  maxInputQueue: 6,
};

export interface Conn {
  ws: WebSocket;
  ip: string;
  room: Room | null;
  side: 0 | 1 | null;
  send(msg: ServerMsg): void;
}

interface Seat {
  name: string;
  paddle: PaddleStyle;
  ready: boolean;
  token: string;
  conn: Conn | null;
  disconnectedAt: number;
  inputs: { seq: number; i: PaddleInput }[];
  ack: number;
}

export class Room {
  seats: [Seat | null, Seat | null] = [null, null];
  phase: RoomPhase = 'lobby';
  sim: GameSim | null = null;
  rematch: [boolean, boolean] = [false, false];
  lastActive = Date.now();
  private events: GameEvent[] = [];
  private tickCount = 0;
  private pausedUntil = 0;
  private firstServer: 0 | 1 = 0;

  constructor(
    readonly code: string,
    readonly settings: RoomSettings,
  ) {}

  get playerCount(): number {
    return (this.seats[0] ? 1 : 0) + (this.seats[1] ? 1 : 0);
  }

  get empty(): boolean {
    return !this.seats[0] && !this.seats[1];
  }

  addPlayer(conn: Conn, name: string, paddle: PaddleStyle): Seat | null {
    const side = !this.seats[0] ? 0 : !this.seats[1] ? 1 : null;
    if (side === null) return null;
    const seat: Seat = {
      name,
      paddle,
      ready: false,
      token: randomBytes(18).toString('base64url'),
      conn,
      disconnectedAt: 0,
      inputs: [],
      ack: 0,
    };
    this.seats[side] = seat;
    conn.room = this;
    conn.side = side;
    this.lastActive = Date.now();
    conn.send({ t: 'joined', code: this.code, side, token: seat.token, settings: this.settings });
    this.broadcastRoom();
    return seat;
  }

  resume(conn: Conn, token: string): boolean {
    for (const side of [0, 1] as const) {
      const seat = this.seats[side];
      if (!seat || seat.token !== token) continue;
      if (seat.conn && seat.conn !== conn) {
        // Same player reconnecting while the old socket is half-open: replace it.
        const old = seat.conn;
        old.room = null;
        old.side = null;
        try {
          old.ws.close(4000, 'replaced');
        } catch {
          /* ignore */
        }
      }
      seat.conn = conn;
      seat.disconnectedAt = 0;
      seat.inputs = [];
      conn.room = this;
      conn.side = side;
      this.lastActive = Date.now();
      conn.send({ t: 'joined', code: this.code, side, token: seat.token, settings: this.settings });
      if (this.sim) conn.send({ t: 'start', seed: 0, firstServer: this.firstServer, settings: this.settings });
      this.broadcastRoom();
      this.maybeUnpause();
      return true;
    }
    return false;
  }

  handle(conn: Conn, msg: ClientMsg): void {
    const side = conn.side;
    if (side === null) return;
    const seat = this.seats[side];
    if (!seat || seat.conn !== conn) return;
    this.lastActive = Date.now();
    switch (msg.t) {
      case 'ready':
        if (this.phase !== 'lobby') return;
        seat.ready = msg.ready;
        this.broadcastRoom();
        this.maybeStart();
        return;
      case 'profile':
        if (this.phase !== 'lobby') return;
        seat.name = msg.name;
        seat.paddle = msg.paddle;
        this.broadcastRoom();
        return;
      case 'input':
        if (msg.seq <= seat.ack) return; // stale or replayed
        if (seat.inputs.length && msg.seq <= seat.inputs[seat.inputs.length - 1].seq) return;
        seat.inputs.push({ seq: msg.seq, i: msg.i });
        if (seat.inputs.length > LIMITS.maxInputQueue) seat.inputs.splice(0, seat.inputs.length - LIMITS.maxInputQueue);
        return;
      case 'rematch':
        if (this.phase !== 'finished') return;
        this.rematch[side] = true;
        this.broadcastRoom();
        if (this.rematch[0] && this.rematch[1]) {
          this.rematch = [false, false];
          this.firstServer = this.firstServer === 0 ? 1 : 0;
          this.sim?.restart(this.firstServer);
          this.phase = 'playing';
          this.broadcast({ t: 'start', seed: 0, firstServer: this.firstServer, settings: this.settings });
          this.broadcastRoom();
        }
        return;
      case 'leave':
        this.removePlayer(side, 'opponentLeft');
        return;
      default:
        return;
    }
  }

  /** Socket dropped: keep the seat for a grace period and pause the game. */
  disconnected(conn: Conn): void {
    const side = conn.side;
    if (side === null) return;
    const seat = this.seats[side];
    if (!seat || seat.conn !== conn) return;
    seat.conn = null;
    seat.disconnectedAt = Date.now();
    seat.ready = this.phase === 'lobby' ? false : seat.ready;
    if (this.sim && this.phase === 'playing') {
      this.sim.paused = true;
      this.pausedUntil = seat.disconnectedAt + LIMITS.reconnectGraceMs;
      this.broadcast({ t: 'paused', reason: 'opponentDisconnected', until: this.pausedUntil });
    }
    this.broadcastRoom();
  }

  removePlayer(side: 0 | 1, reason: 'opponentLeft' | 'timeout'): void {
    const seat = this.seats[side];
    if (!seat) return;
    if (seat.conn) {
      seat.conn.room = null;
      seat.conn.side = null;
    }
    this.seats[side] = null;
    const wasInGame = this.phase !== 'lobby';
    this.phase = 'lobby';
    this.sim = null;
    this.rematch = [false, false];
    const otherSeat = this.seats[side === 0 ? 1 : 0];
    if (otherSeat) {
      otherSeat.ready = false;
      if (wasInGame || reason === 'opponentLeft') otherSeat.conn?.send({ t: 'closed', reason });
    }
    this.broadcastRoom();
  }

  /** Called every server tick (SIM.tickRate Hz). */
  tick(): void {
    const sim = this.sim;
    if (!sim || sim.paused) return;
    for (const side of [0, 1] as const) {
      const seat = this.seats[side];
      if (!seat) continue;
      const next = seat.inputs.shift();
      if (next) {
        sim.setInput(side, next.i);
        seat.ack = next.seq;
      }
    }
    for (let i = 0; i < SIM.stepsPerTick; i++) sim.step();
    for (const e of sim.drainEvents()) this.events.push(e);
    if (sim.phase === 'matchOver' && this.phase === 'playing') {
      this.phase = 'finished';
      this.broadcastRoom();
    }
    this.tickCount++;
    if (this.tickCount % (SIM.tickRate / SIM.snapshotRate) === 0) {
      const s = sim.snapshot();
      s.ack = [this.seats[0]?.ack ?? 0, this.seats[1]?.ack ?? 0];
      this.broadcast({ t: 'state', s, ev: this.events, st: Date.now() });
      this.events = [];
    }
  }

  /** Periodic housekeeping. Returns true when the room should be deleted. */
  sweep(now: number): boolean {
    for (const side of [0, 1] as const) {
      const seat = this.seats[side];
      if (seat && !seat.conn && now - seat.disconnectedAt > LIMITS.reconnectGraceMs) {
        this.removePlayer(side, 'timeout');
      }
    }
    // Rooms whose players are all gone (seats expire after the reconnect grace) are deleted.
    if (this.empty) return true;
    if (this.phase === 'lobby' && now - this.lastActive > LIMITS.idleLobbyMs) {
      this.broadcast({ t: 'closed', reason: 'abandoned' });
      return true;
    }
    return false;
  }

  info(): (PlayerInfo | null)[] {
    return this.seats.map((s) => (s ? { name: s.name, paddle: s.paddle, ready: s.ready, connected: !!s.conn } : null));
  }

  broadcast(msg: ServerMsg): void {
    for (const s of this.seats) s?.conn?.send(msg);
  }

  broadcastRoom(): void {
    this.broadcast({ t: 'room', code: this.code, phase: this.phase, players: this.info(), settings: this.settings, rematch: this.rematch });
  }

  private maybeStart(): void {
    const [a, b] = this.seats;
    if (!a || !b || !a.ready || !b.ready || !a.conn || !b.conn) return;
    const profile = PROFILES[this.settings.assist];
    this.firstServer = randomInt(2) as 0 | 1;
    this.sim = new GameSim({
      kind: 'match',
      bestOf: this.settings.bestOf,
      firstServer: this.firstServer,
      profiles: [profile, profile],
      seed: randomInt(1, 2 ** 31),
      autoServe: [LIMITS.autoServeSeconds, LIMITS.autoServeSeconds],
    });
    a.inputs = [];
    b.inputs = [];
    this.phase = 'playing';
    this.events = [];
    this.broadcast({ t: 'start', seed: 0, firstServer: this.firstServer, settings: this.settings });
    this.broadcastRoom();
  }

  private maybeUnpause(): void {
    if (!this.sim || !this.sim.paused) return;
    if (this.seats.every((s) => s && s.conn)) {
      this.sim.paused = false;
      // The interrupted rally is replayed: no point is awarded for a disconnect.
      this.sim.replayPoint();
      this.broadcast({ t: 'resumed' });
    }
  }
}

export class RoomManager {
  rooms = new Map<string, Room>();
  constructor(private readonly maxRooms: number) {}

  create(conn: Conn, name: string, paddle: PaddleStyle, settings: RoomSettings): Room | ErrorCode {
    if (this.rooms.size >= this.maxRooms) return 'SERVER_FULL';
    let code = '';
    do {
      code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
    } while (this.rooms.has(code));
    const room = new Room(code, settings);
    this.rooms.set(code, room);
    room.addPlayer(conn, name, paddle);
    return room;
  }

  join(conn: Conn, code: string, name: string, paddle: PaddleStyle): Room | ErrorCode {
    const room = this.rooms.get(code);
    if (!room) return 'ROOM_NOT_FOUND';
    if (room.playerCount >= 2) return 'ROOM_FULL';
    room.addPlayer(conn, name, paddle);
    return room;
  }

  resume(conn: Conn, code: string, token: string): Room | ErrorCode {
    const room = this.rooms.get(code);
    if (!room) return 'ROOM_NOT_FOUND';
    return room.resume(conn, token) ? room : 'SESSION_EXPIRED';
  }

  tick(): void {
    for (const r of this.rooms.values()) r.tick();
  }

  sweep(now = Date.now()): void {
    for (const [code, r] of this.rooms) if (r.sweep(now)) this.rooms.delete(code);
  }

  static checkVersion(v: number): boolean {
    return v === PROTOCOL_VERSION;
  }
}
