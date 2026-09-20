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
import { Rng } from '../core/Rng';
import {
  ClientMessage,
  isQuickChatId,
  PROTOCOL_VERSION,
  RejectReason,
  ServerMessage,
  sanitizeDisplayName,
  sanitizeInput,
  sanitizeTeam,
  type JoinOptions,
  type NetChat,
  type NetEvent,
  type NetPing,
  type NetPong,
  type RejectReasonCode,
  type WelcomePayload,
} from '../net/protocol';
import { MatchRoomState, NetPlayer, type RoomStage } from '../net/schema';
import { HeadlessMatch } from './HeadlessMatch';
import { InviteRegistry } from './InviteRegistry';
import { BotSubstitutionManager } from './BotSubstitutionManager';
import { LobbyManager } from './LobbyManager';
import { RemoteInputController } from './RemoteInputController';
import { TeamManager } from './TeamManager';
import { loadHavok } from './loadHavokNode';
import type { MatchConfig, Seat } from '../game/MatchConfig';

/** Stages in which a new player may still take a seat. */
const JOINABLE_STAGES = new Set<RoomStage>([
  'waitingForPlayers',
  'teamSelection',
  'readyCheck',
  'finished',
  'rematchVote',
]);

/** Per-connection data the server keeps. Never sent to any client. */
interface ClientAuth {
  name: string;
  colorId: number;
}

/**
 * Runtime state for one seat. Who is *in* the seat is the TeamManager's
 * business; this is everything the room needs to run it.
 */
interface SeatBinding {
  readonly seat: Seat;
  readonly controller: RemoteInputController;
  readonly netPlayer: NetPlayer;
  /** Token-bucket style counters, reset every second. */
  inputsThisSecond: number;
  controlsThisSecond: number;
  /** Seconds since the socket dropped, counting towards a bot taking over. */
  droppedFor: number;
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
  /** Seats and teams. The only thing allowed to decide who plays where. */
  protected teams!: TeamManager;
  /** Ready state and who owns a private room. */
  protected lobby = new LobbyManager();
  private rateWindowStartedAt = 0;
  private matchOver = false;
  private lastSurrenderAt = 0;
  /** Seeded so a shuffle is reproducible in a test. */
  private readonly shuffleRng = new Rng(0x2f1c33);
  /** Stand-ins for players who dropped. 1×1 never uses it. */
  protected readonly bots = new BotSubstitutionManager();

  override async onCreate(options: Partial<JoinOptions>): Promise<void> {
    const config = this.matchConfig;
    this.maxClients = config.maxPlayers;
    this.patchRate = PATCH_RATE_MS;
    this.autoDispose = true;

    this.state = new MatchRoomState();
    this.state.mode = config.mode;
    this.state.playersPerTeam = config.playersPerTeam;
    this.teams = new TeamManager(config);

    this.invites = new InviteRegistry(this.presence);
    if (options.intent === 'create') {
      // Private rooms are found by code through the HTTP lookup, never by
      // matchmaking, so they are genuinely unlisted.
      this.state.isPrivate = true;
      this.state.inviteCode = await this.invites.claim(this.roomId);
      await this.setPrivate(true);
    }

    this.headless = HeadlessMatch.create(await loadHavok(), {
      roster: config.roster,
      friendlyCollision: config.friendlyCollision,
    });
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

    if (this.teams.freeSeatCount() === 0) throw rejection(RejectReason.RoomFull);
    if (!JOINABLE_STAGES.has(this.state.stage as RoomStage)) {
      throw rejection(RejectReason.MatchInProgress);
    }

    const colorId =
      typeof options.colorId === 'number' && Number.isFinite(options.colorId)
        ? Math.abs(Math.trunc(options.colorId)) % GameConfig.kits.length
        : 0;
    return { name, colorId };
  }

  override onJoin(client: Client, _options: unknown, auth: ClientAuth): void {
    // onAuth already checked, but a second client can win the race between the
    // two calls; refusing here is the last line of defence.
    const assignment = this.teams.claim(client.sessionId);
    const binding = assignment ? this.bindings.get(assignment.seat.playerId) : undefined;
    if (!assignment || !binding) throw rejection(RejectReason.RoomFull);

    this.lobby.add(client.sessionId);
    binding.droppedFor = 0;
    binding.controller.setConnected(true);
    binding.controller.reset();
    binding.netPlayer.name = auth.name;
    binding.netPlayer.colorId = this.pickColor(auth.colorId, binding.seat.team);
    binding.netPlayer.connected = true;
    binding.netPlayer.ready = false;
    binding.netPlayer.rematchVote = false;
    binding.netPlayer.surrenderVote = false;
    binding.netPlayer.botControlled = false;
    binding.netPlayer.departed = false;

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

    this.syncSeats();
    this.refreshStage();
  }

  override async onLeave(client: Client, consented?: boolean): Promise<void> {
    const binding = this.bindingForSession(client.sessionId);
    if (!binding) return;

    binding.controller.setConnected(false);
    binding.netPlayer.connected = false;
    binding.netPlayer.ready = false;
    binding.droppedFor = 0;
    this.lobby.setReady(client.sessionId, false);

    // A match in progress takes a short breath rather than carrying on
    // against a ghost. In 2×2 that pause is brief and a bot then steps in,
    // because stopping four people for thirty seconds is unplayable.
    if (this.state.stage === 'playing' || this.state.stage === 'countdown') {
      this.setStage('reconnectPause');
    }

    if (consented === true) {
      // Walking out of a live 2×2 is the same as never coming back from a
      // drop: the seat keeps playing under a bot rather than leaving three
      // people in a 2v1 that nobody can end.
      binding.netPlayer.departed = true;
      if (this.substitutable) {
        this.takeOverWithBot(binding);
      } else {
        this.releaseSeat(binding, client.sessionId);
        if (this.state.stage === 'reconnectPause') this.finishByAbandon(binding.seat.team);
      }
      this.refreshStage();
      return;
    }

    try {
      await this.allowReconnection(client, this.matchConfig.reconnectGraceSeconds);
      // Colyseus restores the same sessionId, so the seat is still theirs.
      this.restoreSeat(binding);
      this.refreshStage();
    } catch {
      // The grace period ran out. In a mode with bots the seat keeps playing;
      // otherwise the match is over.
      binding.netPlayer.departed = true;
      if (this.substitutable) {
        this.takeOverWithBot(binding);
      } else {
        this.releaseSeat(binding, client.sessionId);
        if (this.state.stage === 'reconnectPause') this.finishByAbandon(binding.seat.team);
      }
      this.refreshStage();
    }
  }

  /** Hands a seat back to the person who dropped out of it. */
  private restoreSeat(binding: SeatBinding): void {
    binding.controller.setConnected(true);
    binding.controller.reset();
    binding.controller.setBot(null);
    binding.netPlayer.connected = true;
    binding.netPlayer.botControlled = false;
    binding.netPlayer.departed = false;
    binding.droppedFor = 0;
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
        inputsThisSecond: 0,
        controlsThisSecond: 0,
        droppedFor: 0,
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

    this.onMessage(ClientMessage.Ready, (client, raw: unknown) => {
      const binding = this.controlMessage(client);
      if (!binding) return;
      if (this.state.stage !== 'teamSelection') return;
      // A ready flag can be taken back until the countdown starts.
      const ready =
        typeof raw === 'object' && raw !== null && 'ready' in raw
          ? Boolean((raw as { ready?: unknown }).ready)
          : true;
      this.lobby.setReady(client.sessionId, ready);
      binding.netPlayer.ready = ready;
      this.refreshStage();
    });

    this.onMessage(ClientMessage.TeamSwitch, (client, raw: unknown) => {
      const binding = this.controlMessage(client);
      if (!binding) return;
      const team = sanitizeTeam((raw as { team?: unknown } | null)?.team);
      if (team === null) return;

      // Requests only. The manager checks there is room and that the match has
      // not started; a client can never state which side it is on.
      const result = this.teams.requestSwitch(client.sessionId, team, this.teamsLocked);
      if (result !== 'ok') return;
      // Moving seats moves identity with it, so names and kits follow.
      this.reseat();
      this.refreshStage();
    });

    this.onMessage(ClientMessage.ShuffleTeams, (client) => {
      const binding = this.controlMessage(client);
      if (!binding) return;
      if (!this.lobby.isHost(client.sessionId) || this.teamsLocked) return;
      // A player who has already said they are ready keeps their seat: the
      // host proposes a shuffle, they do not move people around under them.
      this.teams.shuffle(() => this.shuffleRng.next(), this.lobby.readySessions);
      this.reseat();
      this.refreshStage();
    });

    this.onMessage(ClientMessage.Surrender, (client) => {
      const binding = this.controlMessage(client);
      if (!binding) return;
      this.registerSurrenderVote(binding);
    });

    this.onMessage(ClientMessage.QuickChat, (client, raw: unknown) => {
      const binding = this.controlMessage(client);
      if (!binding) return;
      const id = (raw as { id?: unknown } | null)?.id;
      // Ids only. There is no path here for text a client composed.
      if (!isQuickChatId(id)) return;
      const chat: NetChat = { playerId: binding.seat.playerId, team: binding.seat.team, id };
      this.broadcast(ServerMessage.Chat, chat);
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
    match.events.on('violation', (record) => {
      this.state.lastViolation.kind = record.kind;
      this.state.lastViolation.playerId = record.playerId;
      this.state.lastViolation.offendingTeam = record.offendingTeam;
      this.state.lastViolation.restartPlayerId = record.restartPlayerId;
      this.state.lastViolation.restartTeam = record.restartTeam;
      this.state.lastViolation.tick = record.tick;
      this.emit({
        kind: 'violation',
        playerId: record.playerId,
        team: record.offendingTeam,
        detail: record.kind,
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
      case 'playing':
      case 'goalFreeze': {
        this.loop.advance(deltaMs);
        // The freeze is the match's own celebration phase surfaced as a room
        // stage, so a client can tell "stopped for a goal" from "stopped
        // because somebody dropped".
        const celebrating = this.headless.match.state.phase === 'celebration';
        this.setStage(celebrating ? 'goalFreeze' : 'playing');
        break;
      }
      case 'reconnectPause': {
        this.countDroppedSeats(deltaMs / 1000);
        break;
      }
      case 'finished':
      case 'rematchVote': {
        this.state.stageTimer = Math.max(0, this.state.stageTimer - deltaMs / 1000);
        if (this.state.stageTimer <= 0) void this.disconnect();
        break;
      }
      default:
        break;
    }
  }

  /**
   * Counts how long each empty seat has been empty, and puts a bot in once
   * the short pause is up.
   *
   * 1×1 never reaches here with a bot: there is no game to carry on with, so
   * that mode waits out the full grace period instead.
   */
  private countDroppedSeats(dt: number): void {
    if (this.matchConfig.playersPerTeam < 2 || this.matchOver) return;
    let substituted = false;
    for (const binding of this.occupiedBindings()) {
      if (binding.netPlayer.connected || binding.netPlayer.botControlled) continue;
      binding.droppedFor += dt;
      if (binding.droppedFor >= this.matchConfig.botSubstitutionSeconds) {
        this.takeOverWithBot(binding);
        substituted = true;
      }
    }
    if (substituted) this.refreshStage();
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

  /**
   * Works out where the room should be, from who is in it and what they have
   * agreed to. Every transition happens here and nowhere else, which is what
   * makes "can a fifth player join" and "has the match started twice" answerable.
   */
  /**
   * Settles the room's stage.
   *
   * One change can enable the next — the last "ready" completes the ready
   * check, which starts the countdown — so this runs until the stage stops
   * moving rather than waiting for another message to nudge it along. The
   * guard is there because a rule that oscillated would otherwise spin.
   */
  private refreshStage(): void {
    for (let guard = 0; guard < 4; guard += 1) {
      const before = this.state.stage;
      this.advanceStage();
      if (this.state.stage === before) break;
    }
    this.syncSeats();
  }

  private advanceStage(): void {
    const seated = this.teams.occupied();
    const everyoneHere = this.teams.teamsComplete();
    const sessions = seated.map((assignment) => assignment.sessionId ?? '');
    const everyoneConnected = this.occupiedBindings().every(
      (binding) => binding.netPlayer.connected || binding.netPlayer.botControlled,
    );

    switch (this.state.stage as RoomStage) {
      case 'waitingForPlayers':
        if (everyoneHere) this.setStage('teamSelection');
        break;

      case 'teamSelection':
        if (!everyoneHere) this.setStage('waitingForPlayers');
        else if (this.lobby.everyoneReady(sessions)) this.setStage('readyCheck');
        break;

      case 'readyCheck':
        // A ready check is only a moment: the countdown follows unless somebody
        // has changed their mind or left in the meantime.
        if (!everyoneHere) this.setStage('waitingForPlayers');
        else if (!this.lobby.everyoneReady(sessions)) this.setStage('teamSelection');
        else this.setStage('countdown');
        break;

      case 'reconnectPause':
        if (everyoneConnected && everyoneHere) {
          this.setStage(this.matchOver ? 'finished' : 'playing');
        }
        break;

      case 'finished':
      case 'rematchVote':
        if (everyoneHere && this.occupiedBindings().every((b) => b.netPlayer.rematchVote)) {
          this.resetForRematch();
        } else if (this.occupiedBindings().some((b) => b.netPlayer.rematchVote)) {
          this.setStage('rematchVote');
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
        // Teams are locked from here: nobody swaps sides mid-countdown, and
        // nobody new arrives to find a match already under way.
        void this.lock();
        break;

      case 'playing':
      case 'goalFreeze':
      case 'reconnectPause':
        this.state.stageTimer = 0;
        void this.lock();
        break;

      case 'finished':
      case 'rematchVote':
        this.state.stageTimer = this.matchConfig.finishedTimeoutSeconds;
        this.releaseBotSeats();
        if (this.teams.freeSeatCount() > 0) void this.unlock();
        break;

      case 'waitingForPlayers':
      case 'teamSelection':
      case 'readyCheck':
        this.state.stageTimer = 0;
        // Only re-open a room that actually has a seat. Colyseus locks a full
        // room by itself, and an unconditional unlock would override that and
        // send matchmaking a room with nowhere to sit.
        if (this.teams.freeSeatCount() > 0) void this.unlock();
        break;

      default:
        this.state.stageTimer = 0;
        break;
    }
  }

  /**
   * True when an empty seat should be given to a bot rather than ending the
   * match: a mode with team-mates, a match that is actually under way, and a
   * result that has not been decided yet.
   */
  private get substitutable(): boolean {
    if (this.matchConfig.playersPerTeam < 2 || this.matchOver) return false;
    const stage = this.state.stage as RoomStage;
    return stage === 'playing' || stage === 'goalFreeze' || stage === 'reconnectPause';
  }

  /**
   * Lets go of the seats that finished the match under a bot, so the room can
   * take real players again for a rematch.
   */
  private releaseBotSeats(): void {
    for (const assignment of this.teams.seats) {
      const binding = this.bindings.get(assignment.seat.playerId);
      const sessionId = assignment.sessionId;
      if (!binding || sessionId === null || !binding.netPlayer.botControlled) continue;
      this.releaseSeat(binding, sessionId);
    }
  }

  /** True once teams are settled and nobody may move between them. */
  protected get teamsLocked(): boolean {
    const stage = this.state.stage as RoomStage;
    return stage !== 'waitingForPlayers' && stage !== 'teamSelection';
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

  /**
   * A team gives up together. One player cannot concede for both — unless
   * their partner has left for good and a bot is playing the seat, in which
   * case there is nobody else to ask.
   */
  private registerSurrenderVote(binding: SeatBinding): void {
    if (this.state.stage !== 'playing' && this.state.stage !== 'goalFreeze') return;

    const config = this.matchConfig;
    const played = GameConfig.match.durationSeconds - this.state.timeRemaining;
    const scoreGap = Math.abs(this.state.scoreHome - this.state.scoreAway);
    const losing =
      binding.seat.team === 'home'
        ? this.state.scoreHome < this.state.scoreAway
        : this.state.scoreAway < this.state.scoreHome;
    const allowed =
      played >= config.surrenderAfterSeconds || (losing && scoreGap >= config.surrenderPointGap);
    if (!allowed) return;
    if (this.state.elapsed - this.lastSurrenderAt < config.surrenderCooldownSeconds) return;

    binding.netPlayer.surrenderVote = true;

    const team = binding.seat.team;
    const mates = this.occupiedBindings().filter((other) => other.seat.team === team);
    const humanMates = mates.filter((other) => !other.netPlayer.botControlled);
    const voters = humanMates.length > 0 ? humanMates : mates;
    if (!voters.every((other) => other.netPlayer.surrenderVote)) return;

    this.lastSurrenderAt = this.state.elapsed;
    this.matchOver = true;
    this.emit({ kind: 'surrender', team, detail: 'surrendered' });
    this.finishByAbandon(team);
  }

  /**
   * Re-applies identity after seats moved: the person keeps their name and
   * kit, and the seat keeps its place in the simulation.
   */
  private reseat(): void {
    for (const assignment of this.teams.seats) {
      const binding = this.bindings.get(assignment.seat.playerId);
      if (!binding) continue;
      const occupied = assignment.sessionId !== null;
      binding.controller.setConnected(occupied);
      binding.netPlayer.connected = occupied;
      if (!occupied) binding.netPlayer.name = '';
    }
    this.syncSeats();
  }

  private resetForRematch(): void {
    for (const binding of this.bindings.values()) {
      binding.netPlayer.ready = false;
      binding.netPlayer.rematchVote = false;
      binding.netPlayer.surrenderVote = false;
    }
    this.lobby.clearReady();
    this.matchOver = false;
    this.setStage('teamSelection');
  }

  /** The remaining player wins when their opponent gives up the seat. */
  private finishByAbandon(leftTeam: TeamId): void {
    this.matchOver = true;
    this.emit({ kind: 'matchEnd', team: leftTeam, detail: 'abandoned' });
    this.setStage('finished');
  }

  // ── Seats ───────────────────────────────────────────────────────────────────

  private occupiedBindings(): SeatBinding[] {
    return this.teams
      .occupied()
      .map((assignment) => this.bindings.get(assignment.seat.playerId))
      .filter((binding): binding is SeatBinding => binding !== undefined);
  }

  /**
   * One session holds at most one seat, so a client cannot open a second
   * connection and drive two players.
   */
  private bindingForSession(sessionId: string): SeatBinding | undefined {
    const assignment = this.teams.seatFor(sessionId);
    return assignment ? this.bindings.get(assignment.seat.playerId) : undefined;
  }

  private releaseSeat(binding: SeatBinding, sessionId: string): void {
    this.teams.release(sessionId);
    this.lobby.remove(
      sessionId,
      this.teams.occupied().map((assignment) => assignment.sessionId ?? ''),
    );
    binding.controller.setConnected(false);
    binding.controller.setBot(null);
    this.bots.release(binding.seat.playerId);
    binding.netPlayer.connected = false;
    binding.netPlayer.ready = false;
    binding.netPlayer.rematchVote = false;
    binding.netPlayer.surrenderVote = false;
    binding.netPlayer.botControlled = false;
    binding.netPlayer.isHost = false;
    binding.netPlayer.name = '';
    binding.droppedFor = 0;
  }

  /**
   * Puts a bot in a seat whose player has gone. It plays by exactly the same
   * rules through exactly the same command contract — there is no back door
   * for it to be quicker or more accurate through.
   */
  private takeOverWithBot(binding: SeatBinding): void {
    const bot = this.bots.takeOver({ playerId: binding.seat.playerId, team: binding.seat.team });
    binding.controller.setBot(bot);
    binding.controller.setConnected(true);
    binding.netPlayer.botControlled = true;
    binding.droppedFor = 0;
    this.emit({
      kind: 'botTookOver',
      playerId: binding.seat.playerId,
      team: binding.seat.team,
    });
  }

  /**
   * Copies seat ownership into the state clients read: team, slot, host.
   * Nothing here is ever taken from a client — it is the TeamManager's answer.
   */
  private syncSeats(): void {
    for (const assignment of this.teams.seats) {
      const binding = this.bindings.get(assignment.seat.playerId);
      if (!binding) continue;
      const sessionId = assignment.sessionId;
      binding.netPlayer.team = assignment.seat.team;
      binding.netPlayer.slotIndex = this.slotIndexOf(assignment.seat);
      binding.netPlayer.isHost = sessionId !== null && this.lobby.isHost(sessionId);
      binding.netPlayer.ready = sessionId !== null && this.lobby.isReady(sessionId);
    }
  }

  /** Position of a seat inside its own team, which is what the roster uses. */
  private slotIndexOf(seat: Seat): number {
    return this.matchConfig.seats
      .filter((candidate) => candidate.team === seat.team)
      .findIndex((candidate) => candidate.playerId === seat.playerId);
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
      if (this.teams.seatOf(binding.seat.playerId)?.sessionId && binding.seat.team !== team) {
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
      net.botControlled = binding.controller.isBotControlled;
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
