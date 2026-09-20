/**
 * The client half of the connection.
 *
 * Everything that knows about Colyseus lives here: the rest of the game sees a
 * small surface of "connect", "send my intent", "here is the latest snapshot".
 *
 * The reconnection token is held in this object and in `sessionStorage`, so a
 * reload during a match can come back to the same seat. It is never logged,
 * never shown in the UI and never put in a link — unlike the invite code,
 * which is meant to be shared.
 */
import { Client, type Room } from 'colyseus.js';
import {
  ClientMessage,
  PROTOCOL_VERSION,
  RejectReason,
  ServerMessage,
  roomNameFor,
  toNetInput,
  type JoinIntent,
  type NetChat,
  type NetEvent,
  type NetPong,
  type OnlineMode,
  type QuickChatId,
  type RejectReasonCode,
  type WelcomePayload,
} from './protocol';
import type { TeamId } from '../game/MatchState';
import type { MatchRoomState } from './schema';
import type { PlayerCommand } from '../input/PlayerCommand';

const RECONNECT_KEY = 'stanga.reconnect';
const PING_INTERVAL_MS = 2000;

export interface ConnectRequest {
  intent: JoinIntent;
  /** Which room type to sit in. A join by code follows the room it finds. */
  mode: OnlineMode;
  displayName: string;
  colorId: number;
  /** Required for `intent: 'join'`. */
  inviteCode?: string;
}

export interface RoomClientHandlers {
  onWelcome(welcome: WelcomePayload): void;
  onEvent(event: NetEvent): void;
  onStateChange(state: MatchRoomState): void;
  /** A team-mate or opponent sent one of the fixed phrases. */
  onChat(chat: NetChat): void;
  /** Connection dropped. `willRetry` is false once the grace period is gone. */
  onDisconnected(code: number): void;
  onPing(roundTripMs: number): void;
}

/** A connection attempt that failed for a reason the UI can explain. */
export class ConnectError extends Error {
  constructor(readonly reason: RejectReasonCode | 'unreachable') {
    super(reason);
    this.name = 'ConnectError';
  }
}

/**
 * Works out where the server is. A build can pin it with STANGA_SERVER_URL;
 * otherwise a dev run talks to port 2567 on the same host and a real build
 * talks to its own origin, where a reverse proxy is expected to sit.
 */
export function resolveServerUrl(): string {
  const configured = import.meta.env.STANGA_SERVER_URL;
  if (typeof configured === 'string' && configured.length > 0) return configured;
  if (typeof window === 'undefined') return 'http://localhost:2567';
  const { protocol, hostname, origin } = window.location;
  if (import.meta.env.DEV) return `${protocol}//${hostname}:2567`;
  return origin;
}

export class RoomClient {
  private readonly client: Client;
  private room: Room<MatchRoomState> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private welcome: WelcomePayload | null = null;
  private lastRoundTrip = 0;
  private leaving = false;

  constructor(
    private readonly handlers: RoomClientHandlers,
    private readonly serverUrl = resolveServerUrl(),
  ) {
    this.client = new Client(this.serverUrl);
  }

  get connected(): boolean {
    return this.room !== null;
  }

  get identity(): WelcomePayload | null {
    return this.welcome;
  }

  get roundTripMs(): number {
    return this.lastRoundTrip;
  }

  get state(): MatchRoomState | null {
    return this.room?.state ?? null;
  }

  async connect(request: ConnectRequest): Promise<WelcomePayload> {
    const options = {
      protocolVersion: PROTOCOL_VERSION,
      intent: request.intent,
      displayName: request.displayName,
      colorId: request.colorId,
    };

    const roomName = roomNameFor(request.mode);
    let room: Room<MatchRoomState>;
    try {
      if (request.intent === 'create') {
        room = await this.client.create<MatchRoomState>(roomName, options);
      } else if (request.intent === 'join') {
        // The code decides the room, and with it the mode: a 1x1 code cannot
        // be walked into with a 2x2 client.
        const roomId = await this.lookupInvite(request.inviteCode ?? '');
        room = await this.client.joinById<MatchRoomState>(roomId, options);
      } else {
        room = await this.client.joinOrCreate<MatchRoomState>(roomName, options);
      }
    } catch (error) {
      throw asConnectError(error);
    }

    return this.adopt(room);
  }

  /** Resumes a match after a drop. Throws if the grace period has passed. */
  async resume(): Promise<WelcomePayload> {
    const token = readToken();
    if (token === null) throw new ConnectError('roomNotFound');
    try {
      const room = await this.client.reconnect<MatchRoomState>(token);
      return await this.adopt(room);
    } catch (error) {
      clearToken();
      throw asConnectError(error);
    }
  }

  /** True when a token from an interrupted match is still worth trying. */
  static hasResumableSession(): boolean {
    return readToken() !== null;
  }

  sendInput(command: PlayerCommand): void {
    this.room?.send(ClientMessage.Input, toNetInput(command));
  }

  sendReady(): void {
    this.room?.send(ClientMessage.Ready, {});
  }

  sendRematch(): void {
    this.room?.send(ClientMessage.Rematch, {});
  }

  /** Asks to move to the other team. The server answers through the state. */
  sendTeamSwitch(team: TeamId): void {
    this.room?.send(ClientMessage.TeamSwitch, { team });
  }

  /** Host only; the server checks that, not this. */
  sendShuffleTeams(): void {
    this.room?.send(ClientMessage.ShuffleTeams, {});
  }

  sendOpenRoom(): void {
    this.room?.send(ClientMessage.OpenRoom, {});
  }

  sendSurrender(): void {
    this.room?.send(ClientMessage.Surrender, {});
  }

  sendQuickChat(id: QuickChatId): void {
    this.room?.send(ClientMessage.QuickChat, { id });
  }

  async leave(): Promise<void> {
    this.leaving = true;
    this.stopPinging();
    clearToken();
    const room = this.room;
    this.room = null;
    this.welcome = null;
    if (room) await room.leave(true);
    this.leaving = false;
  }

  private async adopt(room: Room<MatchRoomState>): Promise<WelcomePayload> {
    this.room = room;
    writeToken(room.reconnectionToken);

    const welcome = await new Promise<WelcomePayload>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new ConnectError('unreachable')), 8000);
      // A welcome is not only the greeting: the server repeats it whenever
      // this client's seat changes, so the handler stays registered.
      room.onMessage(ServerMessage.Welcome, (payload: WelcomePayload) => {
        clearTimeout(timeout);
        this.welcome = payload;
        this.handlers.onWelcome(payload);
        resolve(payload);
      });
      room.onError((_code, message) => {
        clearTimeout(timeout);
        reject(new ConnectError(reasonFromMessage(message)));
      });
    });

    room.onMessage(ServerMessage.Event, (event: NetEvent) => this.handlers.onEvent(event));
    room.onMessage(ServerMessage.Chat, (chat: NetChat) => this.handlers.onChat(chat));
    room.onMessage(ServerMessage.Pong, (pong: NetPong) => {
      this.lastRoundTrip = Math.max(0, Date.now() - pong.t);
      this.handlers.onPing(this.lastRoundTrip);
    });
    room.onStateChange((state) => this.handlers.onStateChange(state));
    room.onLeave((code) => {
      this.stopPinging();
      if (this.leaving) return;
      this.room = null;
      this.handlers.onDisconnected(code);
    });

    this.startPinging();
    return welcome;
  }

  private startPinging(): void {
    this.stopPinging();
    this.pingTimer = setInterval(() => {
      this.room?.send(ClientMessage.Ping, { t: Date.now() });
    }, PING_INTERVAL_MS);
  }

  private stopPinging(): void {
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  /** Turns a shared invite code into the room it points at. */
  private async lookupInvite(code: string): Promise<string> {
    const response = await fetch(`${this.serverUrl}/invite/${encodeURIComponent(code)}`);
    if (response.status === 429) throw new ConnectError(RejectReason.RateLimited);
    if (!response.ok) throw new ConnectError(RejectReason.RoomNotFound);
    const payload = (await response.json()) as { roomId?: unknown };
    if (typeof payload.roomId !== 'string') throw new ConnectError(RejectReason.RoomNotFound);
    return payload.roomId;
  }
}

function reasonFromMessage(message: string | undefined): RejectReasonCode | 'unreachable' {
  const known = Object.values(RejectReason) as string[];
  if (typeof message === 'string' && known.includes(message)) {
    return message as RejectReasonCode;
  }
  if (typeof message === 'string' && message.includes('full')) return RejectReason.RoomFull;
  return 'unreachable';
}

function asConnectError(error: unknown): ConnectError {
  if (error instanceof ConnectError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new ConnectError(reasonFromMessage(message));
}

function readToken(): string | null {
  try {
    return window.sessionStorage.getItem(RECONNECT_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string): void {
  try {
    window.sessionStorage.setItem(RECONNECT_KEY, token);
  } catch {
    // Private browsing can refuse storage; a reload then simply cannot resume.
  }
}

function clearToken(): void {
  try {
    window.sessionStorage.removeItem(RECONNECT_KEY);
  } catch {
    // Nothing to clean up if storage was never available.
  }
}
