/**
 * The authoritative room.
 *
 * Everything that decides anything happens here: the room owns a `HeadlessMatch`
 * (the same `MatchEngine` the browser runs) and a `MatchSession` whose slots are
 * bound to `RemoteInputController`s. Clients send intent; the server decides
 * what that intent did.
 *
 * Nothing a client sends is trusted. Team, seat, position, score and kick power
 * are never read from the wire — they are read from the simulation.
 *
 * Mode-specific behaviour lives in `MatchConfig`, so stage 4's 2×2 is a config
 * plus a subclass rather than a second implementation.
 */
import { Room, ServerError, type Client } from '@colyseus/core';
import { GameConfig } from '../config/GameConfig';
import { SimulationLoop } from '../core/SimulationLoop';
import { MatchSession, type PlayerSlot } from '../game/MatchSession';
import type { TeamId } from '../game/MatchState';
import {
  ClientMessage,
  PROTOCOL_VERSION,
  RejectReason,
  ServerMessage,
  sanitizeDisplayName,
  sanitizeInput,
  type JoinOptions,
  type NetEvent,
  type NetPing,
  type NetPong,
  type RejectReasonCode,
  type WelcomePayload,
} from '../net/protocol';
import { MatchRoomState, NetPlayer, type RoomStage } from '../net/schema';
import { HeadlessMatch } from './HeadlessMatch';
import { InviteRegistry } from './InviteRegistry';
import { RemoteInputController } from './RemoteInputController';
import { loadHavok } from './loadHavokNode';
import type { MatchConfig, Seat } from './MatchConfig';

/** Per-connection data the server keeps. Never sent to any client. */
interface ClientAuth {
  name: string;
  colorId: number;
}

interface SeatBinding {
  readonly seat: Seat;
  readonly controller: RemoteInputController;
  readonly netPlayer: NetPlayer;
  /** Colyseus session currently holding the seat, or null while it is free. */
  sessionId: string | null;
  /** Token-bucket style counters, reset every second. */
  inputsThisSecond: number;
  controlsThisSecond: number;
}

const PATCH_RATE_MS = 50;

function rejection(reason: RejectReasonCode): ServerError {
  // The code travels in the message so the client can map it to Hebrew text;
  // Colyseus reserves the numeric code space for its own errors.
  return new ServerError(4400, reason);
}

export abstract class BaseOnlineMatchRoom extends Room<MatchRoomState> {
  abstract readonly matchConfig: MatchConfig;

  private headless!: HeadlessMatch;
  private session!: MatchSession;
  private loop!: SimulationLoop;
  private invites!: InviteRegistry;
  private readonly bindings = new Map<string, SeatBinding>();
  private rateWindowStartedAt = 0;
  private matchOver = false;

  override async onCreate(options: Partial<JoinOptions>): Promise<void> {
    const config = this.matchConfig;
    this.maxClients = config.maxPlayers;
    this.patchRate = PATCH_RATE_MS;
    this.autoDispose = true;

    this.state = new MatchRoomState();
    this.state.mode = config.mode;

    this.invites = new InviteRegistry(this.presence);
    if (options.intent === 'create') {
      // Private rooms are found by code through the HTTP lookup, never by
      // matchmaking, so they are genuinely unlisted.
      this.state.isPrivate = true;
      this.state.inviteCode = await this.invites.claim(this.roomId);
      await this.setPrivate(true);
    }

    this.headless = HeadlessMatch.create(await loadHavok());
    this.session = new MatchSession(this.headless.match, {
      mode: 'online',
      slots: this.buildSlots(),
      aimAssist: 0,
    });
    this.loop = new SimulationLoop((dt, tick) => this.stepSimulation(dt, tick));

    this.bindEngineEvents();
    this.bindMessages();
    this.syncBall();

    this.setSimulationInterval(
      (deltaMs) => this.update(deltaMs),
      GameConfig.simulation.fixedDeltaMs,
    );
  }

  /**
   * Runs before a seat is reserved. Everything that can refuse a client lives
   * here, so a rejected client never reaches the simulation.
   */
  override onAuth(_client: Client, options: Partial<JoinOptions>): ClientAuth {
    if (options.protocolVersion !== PROTOCOL_VERSION) {
      throw rejection(RejectReason.ProtocolMismatch);
    }
    const name = sanitizeDisplayName(options.displayName);
    if (name === null) throw rejection(RejectReason.InvalidName);

    if (this.freeSeat() === null) throw rejection(RejectReason.RoomFull);
    if (this.state.stage === 'countdown' || this.state.stage === 'playing') {
      throw rejection(RejectReason.MatchInProgress);
    }

    const colorId =
      typeof options.colorId === 'number' && Number.isFinite(options.colorId)
        ? Math.abs(Math.trunc(options.colorId)) % GameConfig.kits.length
        : 0;
    return { name, colorId };
  }

  override onJoin(client: Client, _options: unknown, auth: ClientAuth): void {
    const binding = this.freeSeat();
    // onAuth already checked, but a second client can win the race between the
    // two calls; refusing here is the last line of defence.
    if (!binding) throw rejection(RejectReason.RoomFull);

    binding.sessionId = client.sessionId;
    binding.controller.setConnected(true);
    binding.controller.reset();
    binding.netPlayer.name = auth.name;
    binding.netPlayer.colorId = this.pickColor(auth.colorId, binding.seat.team);
    binding.netPlayer.connected = true;
    binding.netPlayer.ready = false;
    binding.netPlayer.rematchVote = false;

    this.session.setName(binding.seat.playerId, auth.name);
    this.session.setColor(binding.seat.playerId, binding.netPlayer.colorId);

    const welcome: WelcomePayload = {
      protocolVersion: PROTOCOL_VERSION,
      playerId: binding.seat.playerId,
      team: binding.seat.team,
      mode: this.matchConfig.mode,
      inviteCode: this.state.inviteCode,
      tickSeconds: GameConfig.simulation.fixedDeltaSeconds,
    };
    client.send(ServerMessage.Welcome, welcome);

    this.refreshStage();
  }

  override async onLeave(client: Client, consented?: boolean): Promise<void> {
    const binding = this.bindingForSession(client.sessionId);
    if (!binding) return;

    binding.controller.setConnected(false);
    binding.netPlayer.connected = false;
    binding.netPlayer.ready = false;

    // A match in progress pauses rather than continuing against a ghost.
    if (this.state.stage === 'playing' || this.state.stage === 'countdown') {
      this.setStage('paused');
    }

    if (consented === true) {
      this.releaseSeat(binding);
      this.refreshStage();
      return;
    }

    try {
      await this.allowReconnection(client, this.matchConfig.reconnectGraceSeconds);
      // Colyseus restores the same sessionId, so the seat is still theirs.
      binding.controller.setConnected(true);
      binding.controller.reset();
      binding.netPlayer.connected = true;
      this.refreshStage();
    } catch {
      this.releaseSeat(binding);
      if (this.state.stage === 'paused') this.finishByAbandon(binding.seat.team);
      this.refreshStage();
    }
  }

  override onDispose(): void {
    void this.invites.release(this.state.inviteCode);
    this.session.dispose();
    this.headless.dispose();
  }

  // ── Setup ───────────────────────────────────────────────────────────────────

  private buildSlots(): PlayerSlot[] {
    const slots: PlayerSlot[] = [];
    for (const seat of this.matchConfig.seats) {
      const controller = new RemoteInputController(
        `net:${seat.playerId}`,
        seat.playerId,
        this.matchConfig.inputQueueLimit,
      );
      controller.setConnected(false);

      const netPlayer = new NetPlayer();
      netPlayer.playerId = seat.playerId;
      netPlayer.team = seat.team;
      netPlayer.connected = false;
      this.state.players.set(seat.playerId, netPlayer);

      this.bindings.set(seat.playerId, {
        seat,
        controller,
        netPlayer,
        sessionId: null,
        inputsThisSecond: 0,
        controlsThisSecond: 0,
      });

      slots.push({
        playerId: seat.playerId,
        team: seat.team,
        name: seat.playerId,
        colorId: seat.team === 'home' ? 0 : 1,
        controller,
      });
    }
    return slots;
  }

  private bindMessages(): void {
    this.onMessage(ClientMessage.Input, (client, raw: unknown) => {
      const binding = this.bindingForSession(client.sessionId);
      if (!binding) return;
      if (binding.inputsThisSecond >= this.matchConfig.maxInputsPerSecond) return;
      binding.inputsThisSecond += 1;

      const input = sanitizeInput(raw);
      if (!input) return;
      // Intent is only ever accepted while the simulation is actually running.
      if (this.state.stage !== 'playing') return;
      binding.controller.enqueue(input);
    });

    this.onMessage(ClientMessage.Ready, (client) => {
      const binding = this.controlMessage(client);
      if (!binding) return;
      if (this.state.stage !== 'lobby') return;
      binding.netPlayer.ready = true;
      this.refreshStage();
    });

    this.onMessage(ClientMessage.Rematch, (client) => {
      const binding = this.controlMessage(client);
      if (!binding) return;
      if (this.state.stage !== 'finished') return;
      binding.netPlayer.rematchVote = true;
      this.refreshStage();
    });

    this.onMessage(ClientMessage.Ping, (client, message: NetPing) => {
      const binding = this.controlMessage(client);
      if (!binding) return;
      const time = typeof message?.t === 'number' && Number.isFinite(message.t) ? message.t : 0;
      const pong: NetPong = { t: time, tick: this.state.tick };
      client.send(ServerMessage.Pong, pong);
    });
  }

  private bindEngineEvents(): void {
    const match = this.headless.match;
    match.events.on('scored', (record) => {
      this.state.lastScore.kind = record.kind;
      this.state.lastScore.team = record.team;
      this.state.lastScore.playerId = record.playerId ?? '';
      this.state.lastScore.points = record.points;
      this.state.lastScore.ownGoal = record.ownGoal;
      this.state.lastScore.tick = record.tick;
      this.emit({
        kind: 'scored',
        playerId: record.playerId ?? undefined,
        team: record.team,
        detail: record.kind,
        points: record.points,
      });
    });
    match.events.on('kick', (event) => {
      this.emit({ kind: 'kick', playerId: event.playerId, team: event.team, speed: event.power });
    });
    match.events.on('tackle', (event) => {
      this.emit({
        kind: 'tackle',
        playerId: event.playerId,
        team: event.team,
        detail: event.success ? 'win' : 'miss',
      });
    });
    match.events.on('frameHit', (event) => {
      this.emit({ kind: 'frameHit', team: event.goal, detail: event.part, speed: event.speed });
    });
    match.events.on('wallHit', (event) => {
      this.emit({ kind: 'wallHit', speed: event.speed });
    });
    match.events.on('kickoff', (event) => {
      this.emit({ kind: 'kickoff', team: event.team });
    });
    match.events.on('matchEnd', (event) => {
      this.matchOver = true;
      this.emit({ kind: 'matchEnd', detail: event.outcome });
      this.setStage('finished');
    });
  }

  // ── Loop ────────────────────────────────────────────────────────────────────

  private update(deltaMs: number): void {
    this.resetRateWindows(deltaMs);

    switch (this.state.stage) {
      case 'countdown': {
        this.state.stageTimer = Math.max(0, this.state.stageTimer - deltaMs / 1000);
        if (this.state.stageTimer <= 0) this.beginMatch();
        break;
      }
      case 'playing': {
        this.loop.advance(deltaMs);
        break;
      }
      case 'finished': {
        this.state.stageTimer = Math.max(0, this.state.stageTimer - deltaMs / 1000);
        if (this.state.stageTimer <= 0) void this.disconnect();
        break;
      }
      default:
        break;
    }
  }

  private stepSimulation(dt: number, tick: number): void {
    // cameraYaw is 0: commands arrive in world space, which is precisely why
    // the server never needs to know where anybody's camera is pointing.
    this.session.collectCommands(tick, 0, dt);
    this.headless.step(dt, tick);
    this.syncPlayers();
    this.syncBall();
    this.syncMatch();
  }

  private resetRateWindows(deltaMs: number): void {
    this.rateWindowStartedAt += deltaMs;
    if (this.rateWindowStartedAt < 1000) return;
    this.rateWindowStartedAt = 0;
    for (const binding of this.bindings.values()) {
      binding.inputsThisSecond = 0;
      binding.controlsThisSecond = 0;
    }
  }

  // ── Stage machine ───────────────────────────────────────────────────────────

  private refreshStage(): void {
    const occupied = this.occupiedBindings();
    const everyoneHere = occupied.length === this.matchConfig.maxPlayers;
    const everyoneConnected = occupied.every((binding) => binding.netPlayer.connected);

    switch (this.state.stage) {
      case 'waiting':
        if (everyoneHere) this.setStage('lobby');
        break;
      case 'lobby':
        if (!everyoneHere) this.setStage('waiting');
        else if (occupied.every((binding) => binding.netPlayer.ready)) this.setStage('countdown');
        break;
      case 'paused':
        if (!everyoneHere) break;
        if (everyoneConnected) this.setStage(this.matchOver ? 'finished' : 'playing');
        break;
      case 'finished':
        if (everyoneHere && occupied.every((binding) => binding.netPlayer.rematchVote)) {
          this.resetForRematch();
        }
        break;
      default:
        break;
    }
  }

  private setStage(stage: RoomStage): void {
    if (this.state.stage === stage) return;
    this.state.stage = stage;

    switch (stage) {
      case 'countdown':
        this.state.stageTimer = this.matchConfig.lobbyCountdownSeconds;
        void this.lock();
        break;
      case 'playing':
        this.state.stageTimer = 0;
        void this.lock();
        break;
      case 'finished':
        this.state.stageTimer = this.matchConfig.finishedTimeoutSeconds;
        break;
      case 'waiting':
      case 'lobby':
        this.state.stageTimer = 0;
        void this.unlock();
        break;
      default:
        this.state.stageTimer = 0;
        break;
    }
  }

  private beginMatch(): void {
    // Guard against a second start: a duplicated countdown would reset the
    // score halfway through a match.
    if (this.state.stage === 'playing') return;
    this.matchOver = false;
    this.loop.resetTicks();
    this.session.resetControllers();
    this.headless.match.start();
    this.setStage('playing');
    this.syncMatch();
  }

  private resetForRematch(): void {
    for (const binding of this.bindings.values()) {
      binding.netPlayer.ready = false;
      binding.netPlayer.rematchVote = false;
    }
    this.matchOver = false;
    this.setStage('lobby');
  }

  /** The remaining player wins when their opponent gives up the seat. */
  private finishByAbandon(leftTeam: TeamId): void {
    this.matchOver = true;
    this.emit({ kind: 'matchEnd', team: leftTeam, detail: 'abandoned' });
    this.setStage('finished');
  }

  // ── Seats ───────────────────────────────────────────────────────────────────

  private freeSeat(): SeatBinding | null {
    for (const binding of this.bindings.values()) {
      if (binding.sessionId === null) return binding;
    }
    return null;
  }

  private occupiedBindings(): SeatBinding[] {
    return [...this.bindings.values()].filter((binding) => binding.sessionId !== null);
  }

  /**
   * One session holds at most one seat, so a client cannot open a second
   * connection and drive both players.
   */
  private bindingForSession(sessionId: string): SeatBinding | undefined {
    for (const binding of this.bindings.values()) {
      if (binding.sessionId === sessionId) return binding;
    }
    return undefined;
  }

  private releaseSeat(binding: SeatBinding): void {
    binding.sessionId = null;
    binding.controller.setConnected(false);
    binding.netPlayer.connected = false;
    binding.netPlayer.ready = false;
    binding.netPlayer.rematchVote = false;
    binding.netPlayer.name = '';
  }

  /** Rate-limits everything that is not an input, and resolves the seat. */
  private controlMessage(client: Client): SeatBinding | undefined {
    const binding = this.bindingForSession(client.sessionId);
    if (!binding) return undefined;
    if (binding.controlsThisSecond >= this.matchConfig.maxControlMessagesPerSecond) {
      return undefined;
    }
    binding.controlsThisSecond += 1;
    return binding;
  }

  /** Keeps the two kits apart even if both players asked for the same one. */
  private pickColor(requested: number, team: TeamId): number {
    const taken = new Set<number>();
    for (const binding of this.bindings.values()) {
      if (binding.sessionId !== null && binding.seat.team !== team) {
        taken.add(binding.netPlayer.colorId);
      }
    }
    let colorId = requested;
    for (let i = 0; i < GameConfig.kits.length && taken.has(colorId); i += 1) {
      colorId = (colorId + 1) % GameConfig.kits.length;
    }
    return colorId;
  }

  // ── State projection ────────────────────────────────────────────────────────

  private syncPlayers(): void {
    for (const player of this.headless.match.state.players) {
      const binding = this.bindings.get(player.id);
      if (!binding) continue;
      const net = binding.netPlayer;
      net.x = player.position.x;
      net.y = player.position.y;
      net.z = player.position.z;
      net.vx = player.velocity.x;
      net.vy = player.velocity.y;
      net.vz = player.velocity.z;
      net.facing = player.facing;
      net.stamina = player.stamina;
      net.kickCharge = player.kickCharge;
      net.charging = player.charging;
      net.lofted = player.lofted;
      net.sprinting = player.sprinting;
      net.stunTimer = player.stunTimer;
      net.lastInput = binding.controller.lastProcessedSequence;
    }
  }

  private syncBall(): void {
    const ball = this.headless.match.state.ball;
    this.state.ball.x = ball.position.x;
    this.state.ball.y = ball.position.y;
    this.state.ball.z = ball.position.z;
    this.state.ball.vx = ball.velocity.x;
    this.state.ball.vy = ball.velocity.y;
    this.state.ball.vz = ball.velocity.z;
    this.state.ball.lastTouchBy = ball.lastTouchBy ?? '';
    this.state.ball.lastTouchTeam = ball.lastTouchTeam ?? '';
  }

  private syncMatch(): void {
    const match = this.headless.match.state;
    this.state.phase = match.phase;
    this.state.tick = match.tick;
    this.state.elapsed = match.elapsed;
    this.state.timeRemaining = match.timeRemaining;
    this.state.scoreHome = match.score.home;
    this.state.scoreAway = match.score.away;
    this.state.kickoffTeam = match.kickoffTeam;
  }

  private emit(event: NetEvent): void {
    this.broadcast(ServerMessage.Event, event);
  }
}
