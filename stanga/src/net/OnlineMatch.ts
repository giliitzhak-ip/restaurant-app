/**
 * The online client: a local simulation kept honest by the server.
 *
 * The client runs the very same `MatchEngine` so that pressing a key moves your
 * player on the same frame — but it runs it in `mirrored` mode, where it
 * decides nothing. The score, the clock, the phase and every goal come from the
 * server and are copied in; the local engine only predicts motion.
 *
 * There is no rollback here, and this file does not pretend otherwise. Drift is
 * closed continuously instead: the opponent is steered back through the normal
 * movement command, the ball is nudged with a velocity correction, and anything
 * that has gone badly wrong (a kickoff, a long stall, a lost packet burst) is
 * snapped. It is the honest trade for a browser build where the physics state
 * cannot be serialized and replayed.
 */
import { GameConfig } from '../config/GameConfig';
import type { MatchEngine } from '../game/MatchEngine';
import type { MatchSession } from '../game/MatchSession';
import { outcomeOf } from '../game/MatchRules';
import type { MatchPhase, ScoreEventRecord, TeamId } from '../game/MatchState';
import type { ScoreKind } from '../config/GameConfig';
import type { NetworkController } from '../input/controllers/NetworkController';
import { RoomClient, type ConnectRequest, type RoomClientHandlers } from './RoomClient';
import type { NetChat, NetEvent, OnlineMode, QuickChatId, WelcomePayload } from './protocol';
import type { MatchRoomState, NetPlayer, RoomStage } from './schema';

/** Beyond this much error a correction stops being a nudge and is a teleport. */
const SNAP_DISTANCE_LOCAL = 2.5;
const SNAP_DISTANCE_REMOTE = 3;
const SNAP_DISTANCE_BALL = 2;
/** How hard a metre of ball drift pulls, in metres per second per metre. */
const BALL_DRIFT_GAIN = 6;
/**
 * Fraction of the local player's error closed per tick. A client that cannot
 * keep 60 frames per second runs fewer ticks than the server and falls steadily
 * behind, so trusting the prediction alone is not enough — but a teleport for
 * half a metre would be worse than the error.
 */
const LOCAL_CORRECTION = 0.15;

export interface OnlineMatchHandlers {
  /** The room's lifecycle changed (waiting, lobby, countdown, playing…). */
  onStage(stage: RoomStage, secondsLeft: number): void;
  /** A gameplay event the server decided actually happened. */
  onServerEvent(event: NetEvent): void;
  /** The opponent dropped; the match is paused while they are given a chance. */
  onOpponentConnected(connected: boolean): void;
  onDisconnected(): void;
  onPing(roundTripMs: number): void;
  /** One of the fixed phrases arrived from another seat. */
  onChat(chat: NetChat): void;
}

export class OnlineMatch {
  readonly client: RoomClient;

  private welcome: WelcomePayload | null = null;
  private snapshot: MatchRoomState | null = null;
  /** One controller per seat this device does *not* drive. */
  private readonly remotes = new Map<string, NetworkController>();
  private session: MatchSession | null = null;
  private opponentConnected = true;
  private lastStage: RoomStage | null = null;
  private lastScoreTick = -1;
  private pendingSnap = true;

  constructor(
    private readonly match: MatchEngine,
    private readonly handlers: OnlineMatchHandlers,
  ) {
    const clientHandlers: RoomClientHandlers = {
      onWelcome: (welcome) => {
        this.welcome = welcome;
        this.pendingSnap = true;
      },
      onEvent: (event) => this.handleServerEvent(event),
      onStateChange: (state) => this.handleSnapshot(state),
      onChat: (chat) => this.handlers.onChat(chat),
      onDisconnected: () => this.handlers.onDisconnected(),
      onPing: (roundTrip) => this.handlers.onPing(roundTrip),
    };
    this.client = new RoomClient(clientHandlers);
  }

  get identity(): WelcomePayload | null {
    return this.welcome;
  }

  get localPlayerId(): string {
    return this.welcome?.playerId ?? 'home-1';
  }

  get localTeam(): TeamId {
    return this.welcome?.team ?? 'home';
  }

  /** Every seat except the one this device drives. */
  get remotePlayerIds(): string[] {
    const snapshot = this.snapshot;
    if (!snapshot) return [];
    const ids: string[] = [];
    snapshot.players.forEach((_net, id) => {
      if (id !== this.localPlayerId) ids.push(id);
    });
    return ids.sort();
  }

  get mode(): OnlineMode {
    return (this.snapshot?.mode as OnlineMode | undefined) ?? this.welcome?.mode ?? 'oneVsOne';
  }

  get playersPerTeam(): number {
    return this.snapshot?.playersPerTeam ?? 1;
  }

  get stage(): RoomStage {
    return (this.snapshot?.stage as RoomStage | undefined) ?? 'waitingForPlayers';
  }

  get inviteCode(): string {
    return this.snapshot?.inviteCode ?? this.welcome?.inviteCode ?? '';
  }

  get roundTripMs(): number {
    return this.client.roundTripMs;
  }

  async connect(request: ConnectRequest): Promise<WelcomePayload> {
    return this.client.connect(request);
  }

  async resume(): Promise<WelcomePayload> {
    return this.client.resume();
  }

  /** Called once the session exists, so commands can be read back and sent. */
  attach(session: MatchSession, remotes: Map<string, NetworkController>): void {
    this.session = session;
    this.remotes.clear();
    for (const [playerId, controller] of remotes) this.remotes.set(playerId, controller);
    this.pendingSnap = true;
  }

  sendReady(): void {
    this.client.sendReady();
  }

  sendRematch(): void {
    this.client.sendRematch();
  }

  /**
   * Lobby requests. Every one of these is exactly that — a request. The server
   * decides whether the seat is free, whether this client is the host and
   * whether the teams are still open, and answers by changing the state.
   */
  requestTeamSwitch(team: TeamId): void {
    this.client.sendTeamSwitch(team);
  }

  requestShuffle(): void {
    this.client.sendShuffleTeams();
  }

  voteSurrender(): void {
    this.client.sendSurrender();
  }

  sendQuickChat(id: QuickChatId): void {
    this.client.sendQuickChat(id);
  }

  async leave(): Promise<void> {
    this.session = null;
    this.remotes.clear();
    await this.client.leave();
  }

  // ── Per-tick work ───────────────────────────────────────────────────────────

  /** Pulls the local bodies back to the server's truth. Runs before commands. */
  beforeTick(): void {
    const snapshot = this.snapshot;
    if (!snapshot) return;

    const local = snapshot.players.get(this.localPlayerId);
    if (local) this.correctPlayer(this.localPlayerId, local, SNAP_DISTANCE_LOCAL);
    for (const playerId of this.remotes.keys()) {
      const net = snapshot.players.get(playerId);
      if (net) this.correctPlayer(playerId, net, SNAP_DISTANCE_REMOTE);
    }
    this.correctBall(snapshot);
    this.pendingSnap = false;
  }

  /** Puts this tick's local intent on the wire. Runs after commands. */
  sendLocalCommand(): void {
    if (this.stage !== 'playing') return;
    const command = this.session?.lastCommandFor(this.localPlayerId);
    if (command) this.client.sendInput(command);
  }

  /** Copies the server's version of the score, clock and phase. */
  afterTick(): void {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    const state = this.match.state;
    state.score.home = snapshot.scoreHome;
    state.score.away = snapshot.scoreAway;
    state.timeRemaining = snapshot.timeRemaining;
    state.elapsed = snapshot.elapsed;
    state.phase = snapshot.phase as MatchPhase;
    state.kickoffTeam = snapshot.kickoffTeam as TeamId;
  }

  // ── Server truth ────────────────────────────────────────────────────────────

  private handleSnapshot(state: MatchRoomState): void {
    this.snapshot = state;

    const stage = state.stage as RoomStage;
    if (stage !== this.lastStage) {
      this.lastStage = stage;
      // Kick-off and resumption both teleport bodies server-side; follow.
      if (stage === 'playing' || stage === 'countdown') this.pendingSnap = true;
      this.handlers.onStage(stage, state.stageTimer);
    }

    // Everybody else's motion, fed back through the controller contract so the
    // simulation cannot tell a remote player from a keyboard.
    let anyoneMissing = false;
    for (const [playerId, controller] of this.remotes) {
      const net = state.players.get(playerId);
      if (!net) continue;
      const present = net.connected || net.botControlled;
      if (!present) anyoneMissing = true;
      controller.apply({
        positionX: net.x,
        positionZ: net.z,
        velocityX: net.vx,
        velocityZ: net.vz,
        facing: net.facing,
        sprinting: net.sprinting,
        charging: net.charging,
        // A kick and a tackle arrive as events; the report carries motion only.
        kicked: false,
        tackled: false,
        connected: present,
      });
    }

    const everyonePresent = !anyoneMissing;
    if (everyonePresent !== this.opponentConnected) {
      this.opponentConnected = everyonePresent;
      this.handlers.onOpponentConnected(everyonePresent);
    }
  }

  /**
   * The local engine already played the sound for anything it predicted (a
   * kick, a tackle, a post), so only the decisions it is *not* allowed to make
   * are turned back into engine events. Feeding them through the same EventBus
   * means the HUD, the audio and the celebration need no online-specific code.
   */
  private handleServerEvent(event: NetEvent): void {
    this.handlers.onServerEvent(event);

    switch (event.kind) {
      case 'scored': {
        const last = this.snapshot?.lastScore;
        const tick = last?.tick ?? -1;
        // A snapshot can repeat the same scoring event; count it once.
        if (tick === this.lastScoreTick) return;
        this.lastScoreTick = tick;
        this.pendingSnap = true;
        this.afterTick();
        const record: ScoreEventRecord = {
          shotId: `server-${tick}`,
          kind: (event.detail ?? 'goal') as ScoreKind,
          team: event.team ?? 'home',
          playerId: event.playerId ?? null,
          points: event.points ?? 1,
          tick,
          ownGoal: last?.ownGoal ?? false,
          shotType: 'ground',
          power: 0,
        };
        this.match.events.emit('scored', record);
        return;
      }
      case 'kickoff': {
        this.pendingSnap = true;
        this.match.events.emit('kickoff', { team: event.team ?? 'home' });
        return;
      }
      case 'violation': {
        // The client's mirrored engine never calls a violation; it is told.
        const last = this.snapshot?.lastViolation;
        this.pendingSnap = true;
        this.afterTick();
        this.match.events.emit('violation', {
          kind: 'doubleTouch',
          playerId: event.playerId ?? '',
          offendingTeam: event.team ?? 'home',
          restartPlayerId: last?.restartPlayerId ?? '',
          restartTeam: (last?.restartTeam as TeamId | undefined) ?? 'away',
          tick: last?.tick ?? 0,
        });
        return;
      }
      case 'matchEnd': {
        this.pendingSnap = true;
        this.afterTick();
        this.match.events.emit('matchEnd', { outcome: outcomeOf(this.match.state) });
        return;
      }
      default:
        return;
    }
  }

  // ── Corrections ─────────────────────────────────────────────────────────────

  private correctPlayer(playerId: string, net: NetPlayer, snapDistance: number): void {
    const body = this.match.bodyFor(playerId);
    if (!body) return;
    const dx = net.x - body.position.x;
    const dz = net.z - body.position.z;
    if (this.pendingSnap || Math.hypot(dx, dz) > snapDistance) {
      body.reset({ x: net.x, y: net.y, z: net.z });
      return;
    }
    // The opponent is steered back through their movement command, which reads
    // more naturally; the local player is the one being predicted here.
    if (playerId === this.localPlayerId) {
      body.nudge(dx * LOCAL_CORRECTION, dz * LOCAL_CORRECTION);
    }
  }

  private correctBall(snapshot: MatchRoomState): void {
    const ball = this.match.ball;
    const dx = snapshot.ball.x - ball.position.x;
    const dy = snapshot.ball.y - ball.position.y;
    const dz = snapshot.ball.z - ball.position.z;

    if (this.pendingSnap || Math.hypot(dx, dy, dz) > SNAP_DISTANCE_BALL) {
      ball.reset({ x: snapshot.ball.x, y: snapshot.ball.y, z: snapshot.ball.z });
      ball.setVelocity(snapshot.ball.vx, snapshot.ball.vy, snapshot.ball.vz);
      return;
    }

    // Nobody commands the ball, so its drift is corrected directly: aim at the
    // server's velocity and lean towards the server's position.
    const maxSpeed = GameConfig.ball.maxSpeed;
    ball.setVelocity(
      clampSpeed(snapshot.ball.vx + dx * BALL_DRIFT_GAIN, maxSpeed),
      snapshot.ball.vy + dy * BALL_DRIFT_GAIN,
      clampSpeed(snapshot.ball.vz + dz * BALL_DRIFT_GAIN, maxSpeed),
    );
  }
}

function clampSpeed(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
}
